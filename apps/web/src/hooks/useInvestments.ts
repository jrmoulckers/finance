// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for accessing and mutating investment portfolio data.
 *
 * Reads from the local SQLite-WASM database via the investments repository.
 * All operations are synchronous against the local DB; errors are captured
 * in state rather than thrown so callers can render gracefully.
 *
 * Usage:
 * ```tsx
 * const { investments, loading, error, createInvestment, refresh } = useInvestments();
 * ```
 *
 * References: issue #1105
 */

import { useCallback, useEffect, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import {
  createInvestment as repoCreateInvestment,
  deleteInvestment as repoDeleteInvestment,
  getAllInvestments,
  updateInvestment as repoUpdateInvestment,
  type CreateInvestmentInput,
  type UpdateInvestmentInput,
} from '../db/repositories/investments';
import type { Investment, SyncId } from '../kmp/bridge';

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
  createInvestment: (input: CreateInvestmentInput) => Investment | null;
  /**
   * Update an existing investment and automatically refresh the list.
   * @returns The updated investment, or `null` if the investment was not found or update failed.
   */
  updateInvestment: (investmentId: SyncId, updates: UpdateInvestmentInput) => Investment | null;
  /**
   * Soft-delete an investment and automatically refresh the list.
   * @returns `true` if deletion succeeded, `false` otherwise.
   */
  deleteInvestment: (investmentId: SyncId) => boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute portfolio summary from a list of investments. */
function computeSummary(investments: Investment[]): PortfolioSummary {
  let totalValue = 0;
  let totalCostBasis = 0;

  for (const inv of investments) {
    totalValue += inv.shares * inv.currentPricePerShare.amount;
    totalCostBasis += inv.shares * inv.costBasisPerShare.amount;
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

    try {
      const result = getAllInvestments(db);
      setInvestments(result);
    } catch (err) {
      // If the table doesn't exist yet, treat it as empty (not an error).
      const message = err instanceof Error ? err.message : '';
      if (message.includes('no such table')) {
        setInvestments([]);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load investments.');
        setInvestments([]);
      }
    } finally {
      setLoading(false);
    }
  }, [db, refreshToken]);

  const summary = computeSummary(investments);

  const createInvestment = useCallback(
    (input: CreateInvestmentInput): Investment | null => {
      try {
        const created = repoCreateInvestment(db, input);
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
    (investmentId: SyncId, updates: UpdateInvestmentInput): Investment | null => {
      try {
        const updated = repoUpdateInvestment(db, investmentId, updates);
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
    (investmentId: SyncId): boolean => {
      try {
        const deleted = repoDeleteInvestment(db, investmentId);
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

  return {
    investments,
    summary,
    loading,
    error,
    refresh,
    createInvestment,
    updateInvestment,
    deleteInvestment,
  };
}
