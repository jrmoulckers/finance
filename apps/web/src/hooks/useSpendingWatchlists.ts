// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for managing spending watchlists with proactive alerts.
 *
 * A "watchlist" is a user-defined spending threshold on a category.
 * When spending reaches warning (80%) or critical (100%) levels,
 * the hook emits alert states that the UI can render as notifications.
 *
 * Watchlist data is persisted in localStorage for offline-first support.
 * Spending totals are computed from the local SQLite-WASM database.
 *
 * Usage:
 * ```tsx
 * const { watchlists, alerts, addWatchlist, removeWatchlist } = useSpendingWatchlists();
 * ```
 *
 * References: issue #316
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import { getTransactionsByCategory } from '../db/repositories/transactions';
import type { SyncId, Transaction } from '../kmp/bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A user-defined spending threshold for a category. */
export interface Watchlist {
  /** Unique identifier (UUID). */
  readonly id: string;
  /** Category to monitor. */
  readonly categoryId: SyncId;
  /** Category display name (cached for offline display). */
  readonly categoryName: string;
  /** Spending threshold in cents. */
  readonly thresholdCents: number;
  /** Period for spending calculation. */
  readonly period: 'monthly' | 'weekly';
  /** Whether alerts are enabled. */
  readonly alertsEnabled: boolean;
  /** Created timestamp. */
  readonly createdAt: string;
  /** Persisted display order. */
  readonly sortOrder?: number;
}

/** Alert severity level. */
export type AlertLevel = 'info' | 'warning' | 'critical';

/** A proactive alert for a watchlist that has reached a threshold. */
export interface WatchlistAlert {
  /** The watchlist that triggered this alert. */
  readonly watchlist: Watchlist;
  /** Current spending in cents for the period. */
  readonly spentCents: number;
  /** Percentage of threshold reached (0-100+). */
  readonly percentage: number;
  /** Alert severity. */
  readonly level: AlertLevel;
  /** Human-readable message. */
  readonly message: string;
}

/** Input for creating a new watchlist. */
export interface CreateWatchlistInput {
  readonly categoryId: SyncId;
  readonly categoryName: string;
  readonly thresholdCents: number;
  readonly period?: 'monthly' | 'weekly';
  readonly alertsEnabled?: boolean;
}

/** Shape returned by {@link useSpendingWatchlists}. */
export interface UseSpendingWatchlistsResult {
  /** All configured watchlists. */
  watchlists: Watchlist[];
  /** Active alerts for watchlists that have reached thresholds. */
  alerts: WatchlistAlert[];
  /** `true` while computing spending totals. */
  loading: boolean;
  /** Human-readable error message, or `null`. */
  error: string | null;
  /** Add a new watchlist. Returns the created watchlist. */
  addWatchlist: (input: CreateWatchlistInput) => Watchlist;
  /** Remove a watchlist by ID. */
  removeWatchlist: (watchlistId: string) => void;
  /** Update the threshold for an existing watchlist. */
  updateThreshold: (watchlistId: string, newThresholdCents: number) => void;
  /** Toggle alerts for a watchlist. */
  toggleAlerts: (watchlistId: string) => void;
  /** Dismiss an alert (hides it until spending changes). */
  dismissAlert: (watchlistId: string) => void;
  /** Reorder persisted watchlists. */
  reorderWatchlists: (fromIndex: number, toIndex: number) => void;
  /** Refresh spending calculations. */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'finance-spending-watchlists';

function normalizeWatchlists(watchlists: readonly Watchlist[]): Watchlist[] {
  return [...watchlists]
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
    .map((watchlist, index) => ({
      ...watchlist,
      sortOrder: index,
    }));
}

function moveWatchlist(
  watchlists: readonly Watchlist[],
  fromIndex: number,
  toIndex: number,
): Watchlist[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= watchlists.length ||
    toIndex >= watchlists.length
  ) {
    return normalizeWatchlists(watchlists);
  }

  const reordered = [...watchlists];
  const [movedWatchlist] = reordered.splice(fromIndex, 1);
  if (!movedWatchlist) {
    return normalizeWatchlists(watchlists);
  }
  reordered.splice(toIndex, 0, movedWatchlist);
  return normalizeWatchlists(reordered);
}

function loadWatchlists(): Watchlist[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return normalizeWatchlists(JSON.parse(raw) as Watchlist[]);
  } catch {
    return [];
  }
}

function saveWatchlists(watchlists: Watchlist[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeWatchlists(watchlists)));
  } catch {
    // Storage may be unavailable.
  }
}

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

function getPeriodBounds(period: 'monthly' | 'weekly'): { startDate: string; endDate: string } {
  const now = new Date();
  const pad = (v: number) => String(v).padStart(2, '0');

  if (period === 'monthly') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      startDate: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
      endDate: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
    };
  }

  // Weekly: Monday to Sunday
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    startDate: `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`,
    endDate: `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())}`,
  };
}

function computeSpending(transactions: Transaction[]): number {
  return transactions.reduce(
    (sum, t) => (t.type === 'EXPENSE' ? sum + Math.abs(t.amount.amount) : sum),
    0,
  );
}

function getAlertLevel(percentage: number): AlertLevel {
  if (percentage >= 100) return 'critical';
  if (percentage >= 80) return 'warning';
  return 'info';
}

function buildAlertMessage(watchlist: Watchlist, percentage: number, spentCents: number): string {
  const spentDollars = (spentCents / 100).toFixed(2);
  const thresholdDollars = (watchlist.thresholdCents / 100).toFixed(2);

  if (percentage >= 100) {
    return `${watchlist.categoryName}: $${spentDollars} spent — exceeded $${thresholdDollars} limit!`;
  }
  if (percentage >= 80) {
    return `${watchlist.categoryName}: $${spentDollars} of $${thresholdDollars} (${Math.round(percentage)}%) — approaching limit`;
  }
  return `${watchlist.categoryName}: $${spentDollars} of $${thresholdDollars} (${Math.round(percentage)}%)`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSpendingWatchlists(): UseSpendingWatchlistsResult {
  const db = useDatabase();
  const [watchlists, setWatchlists] = useState<Watchlist[]>(loadWatchlists);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Persist watchlists whenever they change.
  useEffect(() => {
    saveWatchlists(watchlists);
  }, [watchlists]);

  // Compute alerts from spending data.
  const alerts = useMemo<WatchlistAlert[]>(() => {
    if (watchlists.length === 0) return [];

    try {
      setLoading(true);
      const results: WatchlistAlert[] = [];

      for (const wl of watchlists) {
        if (!wl.alertsEnabled || dismissedIds.has(wl.id)) continue;

        const { startDate, endDate } = getPeriodBounds(wl.period);
        const transactions = getTransactionsByCategory(db, wl.categoryId, {
          type: 'EXPENSE',
        }).filter((t) => t.date >= startDate && t.date <= endDate);

        const spentCents = computeSpending(transactions);
        const percentage = wl.thresholdCents > 0 ? (spentCents / wl.thresholdCents) * 100 : 0;

        if (percentage >= 50) {
          results.push({
            watchlist: wl,
            spentCents,
            percentage,
            level: getAlertLevel(percentage),
            message: buildAlertMessage(wl, percentage, spentCents),
          });
        }
      }

      setLoading(false);
      return results.sort((a, b) => b.percentage - a.percentage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compute spending alerts.');
      setLoading(false);
      return [];
    }
  }, [db, watchlists, dismissedIds, refreshToken]);

  const addWatchlist = useCallback(
    (input: CreateWatchlistInput): Watchlist => {
      const newWl: Watchlist = {
        id: crypto.randomUUID(),
        categoryId: input.categoryId,
        categoryName: input.categoryName,
        thresholdCents: input.thresholdCents,
        period: input.period ?? 'monthly',
        alertsEnabled: input.alertsEnabled ?? true,
        createdAt: new Date().toISOString(),
        sortOrder: watchlists.length,
      };

      setWatchlists((prev) => normalizeWatchlists([...prev, newWl]));
      return newWl;
    },
    [watchlists.length],
  );

  const removeWatchlist = useCallback((watchlistId: string) => {
    setWatchlists((prev) => normalizeWatchlists(prev.filter((wl) => wl.id !== watchlistId)));
  }, []);

  const updateThreshold = useCallback((watchlistId: string, newThresholdCents: number) => {
    setWatchlists((prev) =>
      normalizeWatchlists(
        prev.map((wl) =>
          wl.id === watchlistId ? { ...wl, thresholdCents: newThresholdCents } : wl,
        ),
      ),
    );
  }, []);

  const toggleAlerts = useCallback((watchlistId: string) => {
    setWatchlists((prev) =>
      normalizeWatchlists(
        prev.map((wl) =>
          wl.id === watchlistId ? { ...wl, alertsEnabled: !wl.alertsEnabled } : wl,
        ),
      ),
    );
  }, []);

  const dismissAlert = useCallback((watchlistId: string) => {
    setDismissedIds((prev) => new Set([...prev, watchlistId]));
  }, []);

  const reorderWatchlists = useCallback((fromIndex: number, toIndex: number) => {
    setWatchlists((prev) => moveWatchlist(prev, fromIndex, toIndex));
  }, []);

  const refresh = useCallback(() => {
    setDismissedIds(new Set());
    setRefreshToken((t) => t + 1);
  }, []);

  return {
    watchlists,
    alerts,
    loading,
    error,
    addWatchlist,
    removeWatchlist,
    updateThreshold,
    toggleAlerts,
    dismissAlert,
    reorderWatchlists,
    refresh,
  };
}
