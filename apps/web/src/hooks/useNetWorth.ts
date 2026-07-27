// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for computing net worth analytics.
 *
 * Aggregates account balances into assets vs. liabilities, detects
 * milestones, and provides asset class breakdowns.
 *
 * Usage:
 * ```tsx
 * const { currentNetWorth, assetClasses, milestones, loading } = useNetWorth();
 * ```
 *
 * References: issue #1578
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import { getAllAccounts } from '../db/repositories/accounts';
import { getAllTransactions } from '../db/repositories/transactions';
import {
  computeCurrentNetWorth,
  computeAssetClassBreakdown,
  computePeriodComparison,
  detectMilestones,
} from '../lib/analytics/net-worth';
import type {
  NetWorthDataPoint,
  AssetClassBreakdown,
  NetWorthMilestone,
  PeriodComparison,
} from '../lib/analytics/net-worth';
import { buildNetWorthHistorySeries } from '../lib/visualization/net-worth-history';
import type { NetWorthSeriesPoint } from '../lib/visualization/net-worth-projection';
import {
  type AccountPurposeFilter,
  selectWorkspaceAccounts,
  selectWorkspaceTransactions,
} from '../lib/accountPurpose';
import type { Account, Transaction } from '../kmp/bridge';
import type { DisplayCurrencyAmount } from '../lib/budgeting/display-currency-rollups';
import { useDisplayCurrencyRollup } from './useDisplayCurrencyRollup';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape returned by {@link useNetWorth}. */
export interface UseNetWorthResult {
  /** Current net worth snapshot. */
  currentNetWorth: NetWorthDataPoint | null;
  /** Breakdown of balances by asset class. */
  assetClasses: AssetClassBreakdown[];
  /** Detected milestones with reached status. */
  milestones: NetWorthMilestone[];
  /** Trailing monthly net-worth history, oldest first (for trend + projection). */
  history: NetWorthSeriesPoint[];
  /**
   * Period-over-period change between the two most recent history points
   * (typically month-over-month), or `null` when fewer than two points exist.
   */
  periodComparison: PeriodComparison | null;
  /** True while data is being computed. */
  loading: boolean;
  /** Human-readable error message or null. */
  error: string | null;
  /** Trigger a re-computation. */
  refresh: () => void;
  /** ISO 4217 code the aggregated figures are expressed in (display-currency preference). */
  displayCurrency: string;
  /** `true` when at least one balance was converted from another currency. */
  isConverted: boolean;
  /** `true` when any converted rate is stale or the app is offline. */
  hasStaleRates: boolean;
  /** Currencies with no available rate; their accounts are excluded from the totals. */
  unconvertedCurrencies: readonly string[];
  /** Human-readable conversion/coverage disclosure, or `null` when nothing was converted. */
  conversionDisclosure: string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Computes net worth analytics from local account data.
 *
 * @param purposeFilter - Optional business/personal workspace scope. Defaults to
 *   `'all'`, which aggregates every account. Passing `'business'` or `'personal'`
 *   restricts the snapshot, asset classes, milestones, and history to that
 *   workspace so a small-business owner can separate business from personal net worth.
 */
export function useNetWorth(purposeFilter: AccountPurposeFilter = 'all'): UseNetWorthResult {
  const db = useDatabase();

  const [rawAccounts, setRawAccounts] = useState<Account[] | null>(null);
  const [rawTransactions, setRawTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    setRefreshToken((t) => t + 1);
  }, []);

  useEffect(() => {
    setError(null);
    void (async () => {
      try {
        setRawAccounts(await getAllAccounts(db));
        setRawTransactions(await getAllTransactions(db));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to compute net worth.');
        setRawAccounts([]);
        setRawTransactions([]);
      }
    })();
  }, [db, refreshToken]);

  const scopedAccounts = useMemo(
    () => (rawAccounts ? selectWorkspaceAccounts(rawAccounts, purposeFilter) : []),
    [rawAccounts, purposeFilter],
  );
  const scopedTransactions = useMemo(
    () =>
      rawAccounts ? selectWorkspaceTransactions(rawTransactions, rawAccounts, purposeFilter) : [],
    [rawAccounts, rawTransactions, purposeFilter],
  );

  // Convert every account balance into the user's display currency BEFORE
  // aggregating. Summing raw minor units across currencies is meaningless
  // (¥1,000 is not $1,000) — the root cause of #3282/#3235/#3238. The rollup
  // reuses the shared exchange-rate primitives and the #3460 minor-unit
  // rescale. Archived accounts are excluded here so they never pollute the
  // conversion-coverage disclosure.
  const balanceAmounts = useMemo<DisplayCurrencyAmount[]>(
    () =>
      scopedAccounts
        .filter((account) => !account.isArchived)
        .map((account) => ({
          id: account.id,
          amountCents: account.currentBalance.amount,
          currency: account.currency.code,
        })),
    [scopedAccounts],
  );

  const {
    rollup,
    displayCurrency,
    isConverted,
    hasStaleRates,
    unconvertedCurrencies,
    loading: ratesLoading,
  } = useDisplayCurrencyRollup(balanceAmounts);

  // Map account id -> converted balance (display-currency minor units). Only
  // convertible accounts appear; accounts whose currency has no available rate
  // are surfaced via `unconvertedCurrencies` and excluded from the totals
  // instead of being silently mis-added in their own minor units.
  const convertedById = useMemo(
    () => new Map(rollup.convertedAmounts.map((amount) => [amount.id, amount.displayAmountCents])),
    [rollup],
  );
  const convertibleAccounts = useMemo(
    () => scopedAccounts.filter((account) => convertedById.has(account.id)),
    [scopedAccounts, convertedById],
  );
  const balanceOf = useCallback(
    (account: Account) => convertedById.get(account.id) ?? account.currentBalance.amount,
    [convertedById],
  );

  // Gate readiness on rates so the page never flashes an un-converted (wrong)
  // total before the exchange rates resolve.
  const ready = rawAccounts !== null && !ratesLoading;

  const currentNetWorth = useMemo<NetWorthDataPoint | null>(
    () => (ready ? computeCurrentNetWorth(convertibleAccounts, balanceOf) : null),
    [ready, convertibleAccounts, balanceOf],
  );
  const assetClasses = useMemo<AssetClassBreakdown[]>(
    () => (ready ? computeAssetClassBreakdown(convertibleAccounts, balanceOf) : []),
    [ready, convertibleAccounts, balanceOf],
  );
  const milestones = useMemo<NetWorthMilestone[]>(
    () =>
      currentNetWorth
        ? detectMilestones(currentNetWorth.netWorth, currentNetWorth.liabilities)
        : [],
    [currentNetWorth],
  );

  // History + period comparison stay in raw account currency: converting a
  // historical series correctly requires point-in-time FX rates we do not yet
  // fetch. The current-period headline above is the converted figure users act
  // on; multi-currency history conversion is tracked as a follow-up.
  const history = useMemo<NetWorthSeriesPoint[]>(
    () => (ready ? buildNetWorthHistorySeries(scopedAccounts, scopedTransactions) : []),
    [ready, scopedAccounts, scopedTransactions],
  );
  const periodComparison = useMemo<PeriodComparison | null>(
    () =>
      history.length >= 2
        ? computePeriodComparison(
            history[history.length - 1].netWorthCents,
            history[history.length - 2].netWorthCents,
            history[history.length - 1].label,
            history[history.length - 2].label,
          )
        : null,
    [history],
  );

  const conversionDisclosure = useMemo<string | null>(() => {
    const parts: string[] = [];
    if (rollup.convertedCurrencyCodes.length > 0) parts.push(rollup.disclosure);
    if (unconvertedCurrencies.length > 0) {
      parts.push(`Excluded ${unconvertedCurrencies.join(', ')} — no exchange rate available.`);
    }
    return parts.length > 0 ? parts.join(' ') : null;
  }, [rollup, unconvertedCurrencies]);

  const loading = rawAccounts === null || ratesLoading;

  return {
    currentNetWorth,
    assetClasses,
    milestones,
    history,
    periodComparison,
    loading,
    error,
    refresh,
    displayCurrency,
    isConverted,
    hasStaleRates,
    unconvertedCurrencies,
    conversionDisclosure,
  };
}
