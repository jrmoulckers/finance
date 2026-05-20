// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for subscription detection and rationalization.
 *
 * Analyzes recurring expense transactions to identify subscriptions,
 * compute costs, and enable cancel/keep tracking.
 *
 * Usage:
 * ```tsx
 * const { subscriptions, summary, toggleStatus, loading } = useSubscriptions();
 * ```
 *
 * References: issue #1593
 */

import { useCallback, useEffect, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import { getAllTransactions } from '../db/repositories/transactions';
import { getAllCategories } from '../db/repositories/categories';
import { detectSubscriptions, computeSubscriptionSummary } from '../lib/analytics/subscriptions';
import type {
  DetectedSubscription,
  SubscriptionSummary,
  SubscriptionStatus,
} from '../lib/analytics/subscriptions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape returned by {@link useSubscriptions}. */
export interface UseSubscriptionsResult {
  /** All detected subscriptions. */
  subscriptions: DetectedSubscription[];
  /** Summary statistics. */
  summary: SubscriptionSummary;
  /** True while data is being computed. */
  loading: boolean;
  /** Human-readable error message or null. */
  error: string | null;
  /** Trigger a re-computation. */
  refresh: () => void;
  /** Toggle a subscription's status (active → flagged → cancelled → active). */
  toggleStatus: (subscriptionId: string) => void;
  /** Set a specific status for a subscription. */
  setStatus: (subscriptionId: string, status: SubscriptionStatus) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CYCLE: SubscriptionStatus[] = ['active', 'flagged', 'cancelled'];

function nextStatus(current: SubscriptionStatus): SubscriptionStatus {
  const idx = STATUS_CYCLE.indexOf(current);
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Detects and manages subscriptions from local transaction data. */
export function useSubscriptions(): UseSubscriptionsResult {
  const db = useDatabase();

  const [subscriptions, setSubscriptions] = useState<DetectedSubscription[]>([]);
  const [summary, setSummary] = useState<SubscriptionSummary>({
    totalMonthlyCents: 0,
    totalAnnualCents: 0,
    activeCount: 0,
    flaggedCount: 0,
    cancelledCount: 0,
    byCategory: [],
  });
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
      const transactions = getAllTransactions(db);
      const categories = getAllCategories(db);
      const detected = detectSubscriptions(transactions, categories);
      const sum = computeSubscriptionSummary(detected);

      setSubscriptions(detected);
      setSummary(sum);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to detect subscriptions.');
    } finally {
      setLoading(false);
    }
  }, [db, refreshToken]);

  const toggleStatus = useCallback((subscriptionId: string) => {
    setSubscriptions((prev) => {
      const updated = prev.map((sub) =>
        sub.id === subscriptionId ? { ...sub, status: nextStatus(sub.status) } : sub,
      );
      setSummary(computeSubscriptionSummary(updated));
      return updated;
    });
  }, []);

  const setStatus = useCallback((subscriptionId: string, status: SubscriptionStatus) => {
    setSubscriptions((prev) => {
      const updated = prev.map((sub) => (sub.id === subscriptionId ? { ...sub, status } : sub));
      setSummary(computeSubscriptionSummary(updated));
      return updated;
    });
  }, []);

  return { subscriptions, summary, loading, error, refresh, toggleStatus, setStatus };
}
