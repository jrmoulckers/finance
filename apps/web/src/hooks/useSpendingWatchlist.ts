// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for managing spending watchlists with threshold alerts.
 *
 * Users define watchlists (category + monthly threshold in cents). The hook
 * computes current-month spending per category from {@link useTransactions}
 * and classifies each watchlist as safe / warning / exceeded.
 *
 * Watchlists are persisted in `localStorage` under the key
 * `finance-spending-watchlists`.
 *
 * References: issue #316
 */

import { useCallback, useMemo, useState } from 'react';

import { useCategories } from './useCategories';
import { useTransactions } from './useTransactions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'finance-spending-watchlists';

/** Percentage threshold below which spending is considered safe. */
const SAFE_CEILING = 75;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface Watchlist {
  id: string;
  categoryId: string;
  categoryName: string;
  monthlyThreshold: number; // cents
  isActive: boolean;
  createdAt: string;
}

export interface WatchlistStatus {
  watchlist: Watchlist;
  currentSpending: number; // cents spent this month
  percentage: number; // 0–100+
  status: 'safe' | 'warning' | 'exceeded';
  remaining: number; // cents remaining (negative if exceeded)
}

export interface UseSpendingWatchlistResult {
  watchlists: WatchlistStatus[];
  loading: boolean;
  error: string | null;
  addWatchlist: (categoryId: string, threshold: number) => void;
  removeWatchlist: (id: string) => void;
  updateThreshold: (id: string, threshold: number) => void;
  toggleActive: (id: string) => void;
  /** Only items with `warning` or `exceeded` status. */
  alerts: WatchlistStatus[];
}

// ---------------------------------------------------------------------------
// Helpers (exported for testability)
// ---------------------------------------------------------------------------

/** Read watchlists from localStorage. */
export function loadWatchlists(): Watchlist[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Watchlist[];
  } catch {
    return [];
  }
}

/** Write watchlists to localStorage. */
export function saveWatchlists(items: Watchlist[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/** Classify a percentage into a status bucket. */
export function classifyStatus(percentage: number): 'safe' | 'warning' | 'exceeded' {
  if (percentage > 100) return 'exceeded';
  if (percentage >= SAFE_CEILING) return 'warning';
  return 'safe';
}

/** Generate a simple unique id. */
function generateId(): string {
  return `wl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Return the ISO-8601 date boundaries of the current month (inclusive). */
function currentMonthBounds(): { startDate: string; endDate: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed

  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0); // last day of month

  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    startDate: `${y}-${pad(m + 1)}-01`,
    endDate: `${y}-${pad(m + 1)}-${pad(end.getDate())}`,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSpendingWatchlist(): UseSpendingWatchlistResult {
  const [items, setItems] = useState<Watchlist[]>(loadWatchlists);

  const { categories } = useCategories();

  // Fetch all expense transactions for the current month.
  const { startDate, endDate } = currentMonthBounds();
  const filters = useMemo(
    () => ({ type: 'EXPENSE' as const, startDate, endDate }),
    [startDate, endDate],
  );
  const { transactions, loading, error } = useTransactions(filters);

  // Build a map of categoryId → total spending (cents) for the current month.
  const spendingByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const txn of transactions) {
      if (txn.categoryId) {
        map.set(txn.categoryId, (map.get(txn.categoryId) ?? 0) + Math.abs(txn.amount.amount));
      }
    }
    return map;
  }, [transactions]);

  // Build a lookup of category id → name.
  const categoryNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) {
      map.set(cat.id, cat.name);
    }
    return map;
  }, [categories]);

  // Enrich each watchlist with computed status fields.
  const watchlists: WatchlistStatus[] = useMemo(
    () =>
      items.map((wl) => {
        const currentSpending = spendingByCategory.get(wl.categoryId) ?? 0;
        const percentage =
          wl.monthlyThreshold > 0
            ? Math.round((currentSpending / wl.monthlyThreshold) * 100)
            : currentSpending > 0
              ? 100
              : 0;
        const remaining = wl.monthlyThreshold - currentSpending;

        // Keep category name in sync with current category data.
        const enrichedWl: Watchlist = {
          ...wl,
          categoryName: categoryNameMap.get(wl.categoryId) ?? wl.categoryName,
        };

        return {
          watchlist: enrichedWl,
          currentSpending,
          percentage,
          status: classifyStatus(percentage),
          remaining,
        };
      }),
    [items, spendingByCategory, categoryNameMap],
  );

  const alerts = useMemo(
    () =>
      watchlists.filter(
        (ws) => ws.watchlist.isActive && (ws.status === 'warning' || ws.status === 'exceeded'),
      ),
    [watchlists],
  );

  // -------------------------------------------------------------------
  // Mutation helpers
  // -------------------------------------------------------------------

  const persist = useCallback((next: Watchlist[]) => {
    setItems(next);
    saveWatchlists(next);
  }, []);

  const addWatchlist = useCallback(
    (categoryId: string, threshold: number) => {
      const name = categoryNameMap.get(categoryId) ?? 'Unknown';
      const newItem: Watchlist = {
        id: generateId(),
        categoryId,
        categoryName: name,
        monthlyThreshold: threshold,
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      persist([...items, newItem]);
    },
    [items, categoryNameMap, persist],
  );

  const removeWatchlist = useCallback(
    (id: string) => {
      persist(items.filter((w) => w.id !== id));
    },
    [items, persist],
  );

  const updateThreshold = useCallback(
    (id: string, threshold: number) => {
      persist(items.map((w) => (w.id === id ? { ...w, monthlyThreshold: threshold } : w)));
    },
    [items, persist],
  );

  const toggleActive = useCallback(
    (id: string) => {
      persist(items.map((w) => (w.id === id ? { ...w, isActive: !w.isActive } : w)));
    },
    [items, persist],
  );

  return {
    watchlists,
    loading,
    error,
    addWatchlist,
    removeWatchlist,
    updateThreshold,
    toggleActive,
    alerts,
  };
}
