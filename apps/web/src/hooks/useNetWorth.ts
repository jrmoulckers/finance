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
  detectMilestones,
} from '../lib/analytics/net-worth';
import type {
  NetWorthDataPoint,
  AssetClassBreakdown,
  NetWorthMilestone,
} from '../lib/analytics/net-worth';
import { buildNetWorthHistorySeries } from '../lib/visualization/net-worth-history';
import type { NetWorthSeriesPoint } from '../lib/visualization/net-worth-projection';

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

/** Computes net worth analytics from local account data. */
export function useNetWorth(): UseNetWorthResult {
  const db = useDatabase();

  const [currentNetWorth, setCurrentNetWorth] = useState<NetWorthDataPoint | null>(null);
  const [assetClasses, setAssetClasses] = useState<AssetClassBreakdown[]>([]);
  const [milestones, setMilestones] = useState<NetWorthMilestone[]>([]);
  const [history, setHistory] = useState<NetWorthSeriesPoint[]>([]);
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

      const nw = computeCurrentNetWorth(accounts);
      const classes = computeAssetClassBreakdown(accounts);
      const ms = detectMilestones(nw.netWorth, nw.liabilities);
      const series = buildNetWorthHistorySeries(accounts, transactions);

      setCurrentNetWorth(nw);
      setAssetClasses(classes);
      setMilestones(ms);
      setHistory(series);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compute net worth.');
    } finally {
      setLoading(false);
    }
  }, [db, refreshToken]);

  return { currentNetWorth, assetClasses, milestones, history, loading, error, refresh };
}
