// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for accessing and mutating transaction data with rich filtering.
 *
 * Supports filtering by search term, type, account, category, and date range.
 * The repository natively handles `searchTerm`, `type`, and `limit`; the hook
 * composes `accountId`, `categoryId`, and date bounds by delegating to the
 * most selective repository helper and post-filtering locally where needed.
 *
 * **Filter object stability:** pass a memoized filters object (e.g. via
 * `useMemo`) to prevent unnecessary re-fetches when the parent component
 * re-renders.
 *
 * Usage:
 * ```tsx
 * const filters = useMemo(() => ({ accountId, type: 'EXPENSE' }), [accountId]);
 * const { transactions, loading } = useTransactions(filters);
 * ```
 *
 * References: issue #443
 */

import { useCallback, useEffect, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import {
  createTransaction as repoCreateTransaction,
  deleteTransaction as repoDeleteTransaction,
  getAllTransactions,
  getTransactionsByAccount,
  getTransactionsByCategory,
  getTransactionsByDateRange,
  updateTransaction as repoUpdateTransaction,
  type CreateTransactionInput,
  type TransactionFilters as RepositoryTransactionFilters,
  type UpdateTransactionInput,
} from '../db/repositories/transactions';
import type { LocalDate, SyncId, Transaction, TransactionType } from '../kmp/bridge';

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

/**
 * Extended filter options for {@link useTransactions}.
 *
 * The repository natively supports `searchTerm`, `type`, and `limit`.
 * `accountId`, `categoryId`, `startDate`, and `endDate` are composed via
 * repository helpers and/or local JavaScript post-filtering.
 */
export interface TransactionFilters {
  /** Free-text search against payee and note fields. */
  searchTerm?: string;
  /** Restrict results to a single transaction type. */
  type?: TransactionType;
  /** Restrict results to a single account. */
  accountId?: SyncId;
  /** Restrict results to a single category. */
  categoryId?: SyncId;
  /** Inclusive lower bound on the transaction date (ISO-8601 local date). */
  startDate?: LocalDate;
  /** Inclusive upper bound on the transaction date (ISO-8601 local date). */
  endDate?: LocalDate;
  /** Maximum number of results to return. */
  limit?: number;
}

// ---------------------------------------------------------------------------
// Filtering logic (pure, exported for testability)
// ---------------------------------------------------------------------------

/**
 * Compose repository helpers and local filtering to satisfy the full set of
 * {@link TransactionFilters}.
 *
 * Strategy:
 * 1. Use `getTransactionsByAccount` when `accountId` is the primary key.
 * 2. Otherwise use `getTransactionsByCategory` when `categoryId` is set.
 * 3. Otherwise use `getTransactionsByDateRange` when both dates are present.
 * 4. Fall back to `getAllTransactions` for text/type-only filtering.
 *
 * Secondary criteria (e.g. a `categoryId` combined with an `accountId`) are
 * applied as JavaScript post-filters after the primary query returns.
 * `limit` is pushed to the database only when no local post-filtering is
 * required; otherwise it is applied after all local filters to preserve
 * correct counts.
 */
export function applyTransactionFilters(
  db: ReturnType<typeof useDatabase>,
  filters: TransactionFilters,
): Transaction[] {
  const { searchTerm, type, accountId, categoryId, startDate, endDate, limit } = filters;

  // Base filters that the repository natively supports.
  const baseDbFilters: RepositoryTransactionFilters = { searchTerm, type };

  let results: Transaction[];

  // -------------------------------------------------------------------------
  // Choose the most selective primary DB query and track which secondary
  // criteria must be applied as local post-filters.
  // -------------------------------------------------------------------------

  let needsLocalCategoryFilter = false;
  let needsLocalStartDateFilter = false;
  let needsLocalEndDateFilter = false;

  if (accountId !== undefined) {
    // Account is the primary axis.  Category and dates need local filtering.
    needsLocalCategoryFilter = categoryId !== undefined;
    needsLocalStartDateFilter = startDate !== undefined;
    needsLocalEndDateFilter = endDate !== undefined;

    const hasLocalFilter = needsLocalCategoryFilter || needsLocalStartDateFilter || needsLocalEndDateFilter;
    results = getTransactionsByAccount(db, accountId, {
      ...baseDbFilters,
      limit: hasLocalFilter ? undefined : limit,
    });
  } else if (categoryId !== undefined) {
    // Category is the primary axis.  Date bounds need local filtering.
    needsLocalStartDateFilter = startDate !== undefined;
    needsLocalEndDateFilter = endDate !== undefined;

    const hasLocalFilter = needsLocalStartDateFilter || needsLocalEndDateFilter;
    results = getTransactionsByCategory(db, categoryId, {
      ...baseDbFilters,
      limit: hasLocalFilter ? undefined : limit,
    });
  } else if (startDate !== undefined && endDate !== undefined) {
    // Full date range — repository handles it entirely; push limit to DB.
    results = getTransactionsByDateRange(db, startDate, endDate, { ...baseDbFilters, limit });
    return results;
  } else if (startDate !== undefined) {
    // Open-ended lower bound — fetch all and post-filter.
    needsLocalStartDateFilter = true;
    results = getAllTransactions(db, baseDbFilters);
  } else if (endDate !== undefined) {
    // Open-ended upper bound — fetch all and post-filter.
    needsLocalEndDateFilter = true;
    results = getAllTransactions(db, baseDbFilters);
  } else {
    // No structural filters — everything goes to the DB including limit.
    return getAllTransactions(db, { ...baseDbFilters, limit });
  }

  // -------------------------------------------------------------------------
  // Local post-filters
  // -------------------------------------------------------------------------

  if (needsLocalCategoryFilter && categoryId !== undefined) {
    results = results.filter((t) => t.categoryId === categoryId);
  }

  if (needsLocalStartDateFilter && startDate !== undefined) {
    results = results.filter((t) => t.date >= startDate);
  }

  if (needsLocalEndDateFilter && endDate !== undefined) {
    results = results.filter((t) => t.date <= endDate);
  }

  if (limit !== undefined) {
    results = results.slice(0, limit);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Shape returned by {@link useTransactions}. */
export interface UseTransactionsResult {
  /** Filtered, ordered transaction list. */
  transactions: Transaction[];
  /** `true` while the initial or refresh load is in progress. */
  loading: boolean;
  /** Human-readable error message from the last failed operation, or `null`. */
  error: string | null;
  /** Trigger a re-fetch with the current filters. */
  refresh: () => void;
  /**
   * Create a new transaction and automatically refresh the list.
   * @returns The created transaction, or `null` if creation failed.
   */
  createTransaction: (input: CreateTransactionInput) => Transaction | null;
  /**
   * Update an existing transaction and automatically refresh the list.
   * @returns The updated transaction, or `null` if the record was not found or update failed.
   */
  updateTransaction: (transactionId: SyncId, updates: UpdateTransactionInput) => Transaction | null;
  /**
   * Soft-delete a transaction and automatically refresh the list.
   * @returns `true` if deletion succeeded, `false` otherwise.
   */
  deleteTransaction: (transactionId: SyncId) => boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Load transactions from the local database with optional filtering.
 *
 * @param filters - Optional filter object.  Pass a stable (memoized) reference
 *   to avoid unnecessary re-fetches on every render.
 */
export function useTransactions(filters: TransactionFilters = {}): UseTransactionsResult {
  const db = useDatabase();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  // Serialize filters to a stable string so the effect can depend on their
  // values rather than object identity.
  const filtersKey = JSON.stringify(filters);

  /** Trigger a re-fetch of the current transaction list. */
  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshToken((t) => t + 1);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      // Re-parse from the serialized key so we always use the latest values
      // without adding `filters` to deps (which would cause re-runs on every
      // render due to object identity churn).
      const parsedFilters = JSON.parse(filtersKey) as TransactionFilters;
      const result = applyTransactionFilters(db, parsedFilters);
      setTransactions(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions.');
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [db, refreshToken, filtersKey]);

  const createTransaction = useCallback(
    (input: CreateTransactionInput): Transaction | null => {
      try {
        const created = repoCreateTransaction(db, input);
        refresh();
        return created;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create transaction.');
        setLoading(false);
        return null;
      }
    },
    [db, refresh],
  );

  const updateTransaction = useCallback(
    (transactionId: SyncId, updates: UpdateTransactionInput): Transaction | null => {
      try {
        const updated = repoUpdateTransaction(db, transactionId, updates);
        if (updated !== null) {
          refresh();
        }
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update transaction.');
        setLoading(false);
        return null;
      }
    },
    [db, refresh],
  );

  const deleteTransaction = useCallback(
    (transactionId: SyncId): boolean => {
      try {
        const deleted = repoDeleteTransaction(db, transactionId);
        if (deleted) {
          refresh();
        }
        return deleted;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete transaction.');
        setLoading(false);
        return false;
      }
    },
    [db, refresh],
  );

  return {
    transactions,
    loading,
    error,
    refresh,
    createTransaction,
    updateTransaction,
    deleteTransaction,
  };
}
