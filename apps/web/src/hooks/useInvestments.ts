// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for accessing and mutating investment portfolio data.
 *
 * Reads from the local database via the investments repository. Reads resolve
 * asynchronously against the AsyncDb data layer and are captured into state;
 * errors are captured in state rather than thrown so callers can render
 * gracefully.
 *
 * Extended to support lot-level cost-basis tracking (#1588),
 * target-vs-actual allocation (#1595), and fee analysis (#1625).
 *
 * Usage:
 * ```tsx
 * const { investments, loading, error, createInvestment, refresh } = useInvestments();
 * ```
 *
 * References: issues #1105, #1585, #1588, #1595, #1625
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import {
  createInvestment as repoCreateInvestment,
  deleteInvestment as repoDeleteInvestment,
  getAllInvestments,
  updateInvestment as repoUpdateInvestment,
  type CreateInvestmentInput,
  type UpdateInvestmentInput,
} from '../db/repositories/investments';
import {
  createLot as repoCreateLot,
  deleteLot as repoDeleteLot,
  getLotsByInvestment,
  updateLot as repoUpdateLot,
  type CreateLotInput,
  type UpdateLotInput,
} from '../db/repositories/investment-lots';
import type { Investment, InvestmentLot, SyncId } from '../kmp/bridge';
import { computeAllocation, analyzeFees, DEFAULT_ASSET_CLASS_MAP } from '../lib/investment';
import type { HoldingWithClass, FeeHoldingInput } from '../lib/investment';
import type { AllocationAnalysis, AllocationTarget, FeeAnalysis } from '../types/investment';
import type { DisplayCurrencyAmount } from '../lib/budgeting/display-currency-rollups';
import { useDisplayCurrencyRollup } from './useDisplayCurrencyRollup';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Computed portfolio summary statistics. */
export interface PortfolioSummary {
  /** Total current market value in cents. */
  totalValue: number;
  /** Total cost basis in cents. */
  totalCostBasis: number;
  /** Total gain/loss in cents. */
  totalGainLoss: number;
  /** Total gain/loss as a percentage of cost basis. */
  totalGainLossPercent: number;
}

/** Shape returned by {@link useInvestments}. */
export interface UseInvestmentsResult {
  /** All non-deleted investments ordered by symbol. */
  investments: Investment[];
  /** Computed portfolio summary statistics. */
  summary: PortfolioSummary;
  /** ISO 4217 code the summary figures are expressed in (display-currency preference). */
  displayCurrency: string;
  /** `true` when at least one holding's value was converted from another currency. */
  isConverted: boolean;
  /** `true` when any converted rate is stale or the app is offline. */
  hasStaleRates: boolean;
  /** Currencies with no available rate; their holdings are excluded from the summary totals. */
  unconvertedCurrencies: readonly string[];
  /** Human-readable conversion/coverage disclosure, or `null` when nothing was converted. */
  conversionDisclosure: string | null;
  /** `true` while the initial or refresh load is in progress. */
  loading: boolean;
  /** Human-readable error message from the last failed operation, or `null`. */
  error: string | null;
  /** Trigger a re-fetch of all investments from the local database. */
  refresh: () => void;
  /**
   * Create a new investment and automatically refresh the list.
   * @returns The created investment, or `null` if creation failed.
   */
  createInvestment: (input: CreateInvestmentInput) => Promise<Investment | null>;
  /**
   * Update an existing investment and automatically refresh the list.
   * @returns The updated investment, or `null` if the investment was not found or update failed.
   */
  updateInvestment: (
    investmentId: SyncId,
    updates: UpdateInvestmentInput,
  ) => Promise<Investment | null>;
  /**
   * Soft-delete an investment and automatically refresh the list.
   * @returns `true` if deletion succeeded, `false` otherwise.
   */
  deleteInvestment: (investmentId: SyncId) => Promise<boolean>;

  // --- Lot operations (#1588) ---

  /**
   * Get all lots for a specific investment from the reactively-loaded cache.
   *
   * Synchronous selector over lots preloaded alongside the investment list, so
   * consumers can derive lot-level views inside `useMemo` without awaiting.
   * @returns Array of lots, or empty array if none are loaded for the investment.
   */
  getLots: (investmentId: SyncId) => InvestmentLot[];
  /**
   * Create a new lot for an investment.
   * @returns The created lot, or `null` if creation failed.
   */
  createLot: (input: CreateLotInput) => Promise<InvestmentLot | null>;
  /**
   * Update an existing lot.
   * @returns The updated lot, or `null` if not found or update failed.
   */
  updateLot: (lotId: SyncId, updates: UpdateLotInput) => Promise<InvestmentLot | null>;
  /**
   * Soft-delete a lot.
   * @returns `true` if deletion succeeded, `false` otherwise.
   */
  deleteLot: (lotId: SyncId) => Promise<boolean>;

  // --- Allocation analysis (#1595) ---

  /**
   * Compute target-vs-actual allocation analysis.
   * @param targets - User-defined target allocation percentages.
   * @returns Allocation analysis with deviations and rebalancing suggestions.
   */
  computeAllocationAnalysis: (targets: readonly AllocationTarget[]) => AllocationAnalysis;

  // --- Fee analysis (#1625) ---

  /**
   * Run fee analysis for the portfolio.
   * @param expenseRatios - Map of investmentId → expense ratio in basis points.
   * @param annualReturnPercent - Expected annual return (default: 7%).
   * @returns Complete fee analysis with projections and comparisons.
   */
  computeFeeAnalysis: (
    expenseRatios: ReadonlyMap<string, number>,
    annualReturnPercent?: number,
  ) => FeeAnalysis;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute portfolio summary from a list of investments.
 *
 * Market value and cost basis are read through the optional {@link valueOf} and
 * {@link costBasisOf} resolvers rather than off each holding directly, so a
 * multi-currency portfolio can be converted into a single display currency
 * *before* aggregation. Summing raw minor units across currencies is meaningless
 * (a EUR holding is not a USD holding) — the root cause of #3239. Callers with
 * mixed currencies must pass resolvers that return each holding's value already
 * converted into one common currency.
 *
 * @param investments - Holdings to aggregate (already filtered to convertible ones by the caller).
 * @param valueOf - Resolves a holding's market value in cents. Defaults to
 *   `shares * currentPricePerShare` (correct only for a single-currency portfolio).
 * @param costBasisOf - Resolves a holding's cost basis in cents. Defaults to
 *   `shares * costBasisPerShare` (correct only for a single-currency portfolio).
 */
export function computeSummary(
  investments: Investment[],
  valueOf: (inv: Investment) => number = (inv) => inv.shares * inv.currentPricePerShare.amount,
  costBasisOf: (inv: Investment) => number = (inv) => inv.shares * inv.costBasisPerShare.amount,
): PortfolioSummary {
  let totalValue = 0;
  let totalCostBasis = 0;

  for (const inv of investments) {
    totalValue += valueOf(inv);
    totalCostBasis += costBasisOf(inv);
  }

  const totalGainLoss = totalValue - totalCostBasis;
  const totalGainLossPercent = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;

  return {
    totalValue: Math.round(totalValue),
    totalCostBasis: Math.round(totalCostBasis),
    totalGainLoss: Math.round(totalGainLoss),
    totalGainLossPercent: Math.round(totalGainLossPercent * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Load all investments from the local database and expose CRUD operations. */
export function useInvestments(): UseInvestmentsResult {
  const db = useDatabase();

  const [investments, setInvestments] = useState<Investment[]>([]);
  const [lotsByInvestment, setLotsByInvestment] = useState<Map<string, InvestmentLot[]>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  /** Increment the refresh token to trigger a data re-fetch. */
  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshToken((t) => t + 1);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const result = await getAllInvestments(db);
        setInvestments(result);
        // Preload every investment's lots so `getLots` can be a synchronous
        // selector for the memoized lot-level views consumers derive (#1588).
        const lotEntries = await Promise.all(
          result.map(async (investment) => {
            try {
              return [investment.id, await getLotsByInvestment(db, investment.id)] as const;
            } catch {
              return [investment.id, [] as InvestmentLot[]] as const;
            }
          }),
        );
        setLotsByInvestment(new Map(lotEntries));
      } catch (err) {
        // If the table doesn't exist yet, treat it as empty (not an error).
        const message = err instanceof Error ? err.message : '';
        if (message.includes('no such table')) {
          setInvestments([]);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load investments.');
          setInvestments([]);
        }
        setLotsByInvestment(new Map());
      } finally {
        setLoading(false);
      }
    })();
  }, [db, refreshToken]);

  // Convert each holding's market value and cost basis into the user's display
  // currency BEFORE aggregating the summary cards. Summing raw minor units
  // across currencies is meaningless (a EUR holding is not a USD holding) — the
  // root cause of #3239. This reuses the shared exchange-rate rollup and the
  // #3460 minor-unit rescale, exactly as the net-worth aggregation does (#3514).
  // Each holding contributes a `:value` and a `:cost` amount so both totals are
  // converted with the same rate coverage.
  const valuationAmounts = useMemo<DisplayCurrencyAmount[]>(() => {
    const amounts: DisplayCurrencyAmount[] = [];
    for (const inv of investments) {
      const currency = inv.currency.code;
      amounts.push({
        id: `${inv.id}:value`,
        amountCents: Math.round(inv.shares * inv.currentPricePerShare.amount),
        currency,
      });
      amounts.push({
        id: `${inv.id}:cost`,
        amountCents: Math.round(inv.shares * inv.costBasisPerShare.amount),
        currency,
      });
    }
    return amounts;
  }, [investments]);

  const {
    rollup,
    displayCurrency,
    isConverted,
    hasStaleRates,
    unconvertedCurrencies,
    loading: ratesLoading,
  } = useDisplayCurrencyRollup(valuationAmounts);

  // Map holding id -> converted market value / cost basis (display-currency
  // minor units). Holdings whose currency has no available rate are absent from
  // these maps; they are surfaced via `unconvertedCurrencies` and excluded from
  // the totals rather than silently mis-added in their own minor units.
  const { valueById, costById } = useMemo(() => {
    const valueMap = new Map<string, number>();
    const costMap = new Map<string, number>();
    for (const amount of rollup.convertedAmounts) {
      if (amount.id.endsWith(':value')) {
        valueMap.set(amount.id.slice(0, -':value'.length), amount.displayAmountCents);
      } else if (amount.id.endsWith(':cost')) {
        costMap.set(amount.id.slice(0, -':cost'.length), amount.displayAmountCents);
      }
    }
    return { valueById: valueMap, costById: costMap };
  }, [rollup]);

  const summary = useMemo<PortfolioSummary>(() => {
    const convertible = investments.filter((inv) => valueById.has(inv.id));
    return computeSummary(
      convertible,
      (inv) => valueById.get(inv.id) ?? inv.shares * inv.currentPricePerShare.amount,
      (inv) => costById.get(inv.id) ?? inv.shares * inv.costBasisPerShare.amount,
    );
  }, [investments, valueById, costById]);

  const conversionDisclosure = useMemo<string | null>(() => {
    const parts: string[] = [];
    if (rollup.convertedCurrencyCodes.length > 0) parts.push(rollup.disclosure);
    if (unconvertedCurrencies.length > 0) {
      parts.push(`Excluded ${unconvertedCurrencies.join(', ')} — no exchange rate available.`);
    }
    return parts.length > 0 ? parts.join(' ') : null;
  }, [rollup, unconvertedCurrencies]);

  const createInvestment = useCallback(
    async (input: CreateInvestmentInput): Promise<Investment | null> => {
      try {
        const created = await repoCreateInvestment(db, input);
        refresh();
        return created;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create investment.');
        setLoading(false);
        return null;
      }
    },
    [db, refresh],
  );

  const updateInvestment = useCallback(
    async (investmentId: SyncId, updates: UpdateInvestmentInput): Promise<Investment | null> => {
      try {
        const updated = await repoUpdateInvestment(db, investmentId, updates);
        if (updated !== null) {
          refresh();
        }
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update investment.');
        setLoading(false);
        return null;
      }
    },
    [db, refresh],
  );

  const deleteInvestment = useCallback(
    async (investmentId: SyncId): Promise<boolean> => {
      try {
        const deleted = await repoDeleteInvestment(db, investmentId);
        if (deleted) {
          refresh();
        }
        return deleted;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete investment.');
        setLoading(false);
        return false;
      }
    },
    [db, refresh],
  );

  // --- Lot operations (#1588) ---

  const getLots = useCallback(
    (investmentId: SyncId): InvestmentLot[] => lotsByInvestment.get(investmentId) ?? [],
    [lotsByInvestment],
  );

  const createLot = useCallback(
    async (input: CreateLotInput): Promise<InvestmentLot | null> => {
      try {
        const created = await repoCreateLot(db, input);
        refresh();
        return created;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create lot.');
        setLoading(false);
        return null;
      }
    },
    [db, refresh],
  );

  const updateLotFn = useCallback(
    async (lotId: SyncId, updates: UpdateLotInput): Promise<InvestmentLot | null> => {
      try {
        const updated = await repoUpdateLot(db, lotId, updates);
        if (updated !== null) {
          refresh();
        }
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update lot.');
        setLoading(false);
        return null;
      }
    },
    [db, refresh],
  );

  const deleteLotFn = useCallback(
    async (lotId: SyncId): Promise<boolean> => {
      try {
        const deleted = await repoDeleteLot(db, lotId);
        if (deleted) {
          refresh();
        }
        return deleted;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete lot.');
        setLoading(false);
        return false;
      }
    },
    [db, refresh],
  );

  // --- Allocation analysis (#1595) ---

  const holdingsWithClass: HoldingWithClass[] = useMemo(
    () =>
      investments.map((inv) => ({
        symbol: inv.symbol,
        marketValue: Math.round(inv.shares * inv.currentPricePerShare.amount),
        assetClass: DEFAULT_ASSET_CLASS_MAP[inv.type],
      })),
    [investments],
  );

  const computeAllocationAnalysis = useCallback(
    (targets: readonly AllocationTarget[]): AllocationAnalysis => {
      return computeAllocation(holdingsWithClass, targets);
    },
    [holdingsWithClass],
  );

  // --- Fee analysis (#1625) ---

  const computeFeeAnalysis = useCallback(
    (expenseRatios: ReadonlyMap<string, number>, annualReturnPercent: number = 7): FeeAnalysis => {
      const feeHoldings: FeeHoldingInput[] = investments
        .filter((inv) => expenseRatios.has(inv.id))
        .map((inv) => ({
          investmentId: inv.id,
          symbol: inv.symbol,
          name: inv.name,
          expenseRatioBps: expenseRatios.get(inv.id) ?? 0,
          marketValue: Math.round(inv.shares * inv.currentPricePerShare.amount),
        }));

      return analyzeFees(feeHoldings, annualReturnPercent);
    },
    [investments],
  );

  return {
    investments,
    summary,
    displayCurrency,
    isConverted,
    hasStaleRates,
    unconvertedCurrencies,
    conversionDisclosure,
    // Gate on exchange-rate readiness so the summary cards never flash an
    // un-converted (wrong) total before the rates resolve.
    loading: loading || ratesLoading,
    error,
    refresh,
    createInvestment,
    updateInvestment,
    deleteInvestment,
    getLots,
    createLot,
    updateLot: updateLotFn,
    deleteLot: deleteLotFn,
    computeAllocationAnalysis,
    computeFeeAnalysis,
  };
}
