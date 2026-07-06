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

import { useCallback, useEffect, useState } from 'react';
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

  const [currentNetWorth, setCurrentNetWorth] = useState<NetWorthDataPoint | null>(null);
  const [assetClasses, setAssetClasses] = useState<AssetClassBreakdown[]>([]);
  const [milestones, setMilestones] = useState<NetWorthMilestone[]>([]);
  const [history, setHistory] = useState<NetWorthSeriesPoint[]>([]);
  const [periodComparison, setPeriodComparison] = useState<PeriodComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshToken((t) => t + 1);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      const accounts = getAllAccounts(db);
      const transactions = getAllTransactions(db);

      const scopedAccounts = selectWorkspaceAccounts(accounts, purposeFilter);
      const scopedTransactions = selectWorkspaceTransactions(transactions, accounts, purposeFilter);

      const nw = computeCurrentNetWorth(scopedAccounts);
      const classes = computeAssetClassBreakdown(scopedAccounts);
      const ms = detectMilestones(nw.netWorth, nw.liabilities);
      const series = buildNetWorthHistorySeries(scopedAccounts, scopedTransactions);

      // Period-over-period delta from the two most recent history points
      // (oldest-first series → last two entries are prior period vs. current).
      const comparison =
        series.length >= 2
          ? computePeriodComparison(
              series[series.length - 1].netWorthCents,
              series[series.length - 2].netWorthCents,
              series[series.length - 1].label,
              series[series.length - 2].label,
            )
          : null;

      setCurrentNetWorth(nw);
      setAssetClasses(classes);
      setMilestones(ms);
      setHistory(series);
      setPeriodComparison(comparison);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compute net worth.');
    } finally {
      setLoading(false);
    }
  }, [db, refreshToken, purposeFilter]);

  return {
    currentNetWorth,
    assetClasses,
    milestones,
    history,
    periodComparison,
    loading,
    error,
    refresh,
  };
}
