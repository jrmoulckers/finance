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

import { useCallback, useMemo, useState } from 'react';
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
import type { AsyncDb } from '../db/async-db';
import type { LocalDate, SyncId, Transaction, TransactionType } from '../kmp/bridge';
import { useLiveQuery } from './useLiveQuery';

export interface TransactionFilters {
  searchTerm?: string;
  type?: TransactionType;
  accountId?: SyncId;
  categoryId?: SyncId;
  startDate?: LocalDate;
  endDate?: LocalDate;
  limit?: number;
}

export async function applyTransactionFilters(
  db: AsyncDb,
  filters: TransactionFilters,
): Promise<Transaction[]> {
  const { searchTerm, type, accountId, categoryId, startDate, endDate, limit } = filters;
  const baseDbFilters: RepositoryTransactionFilters = { searchTerm, type };

  let results: Transaction[];
  let needsLocalCategoryFilter = false;
  let needsLocalStartDateFilter = false;
  let needsLocalEndDateFilter = false;

  if (accountId !== undefined) {
    needsLocalCategoryFilter = categoryId !== undefined;
    needsLocalStartDateFilter = startDate !== undefined;
    needsLocalEndDateFilter = endDate !== undefined;

    const hasLocalFilter =
      needsLocalCategoryFilter || needsLocalStartDateFilter || needsLocalEndDateFilter;
    results = await getTransactionsByAccount(db, accountId, {
      ...baseDbFilters,
      limit: hasLocalFilter ? undefined : limit,
    });
  } else if (categoryId !== undefined) {
    needsLocalStartDateFilter = startDate !== undefined;
    needsLocalEndDateFilter = endDate !== undefined;

    const hasLocalFilter = needsLocalStartDateFilter || needsLocalEndDateFilter;
    results = await getTransactionsByCategory(db, categoryId, {
      ...baseDbFilters,
      limit: hasLocalFilter ? undefined : limit,
    });
  } else if (startDate !== undefined && endDate !== undefined) {
    return await getTransactionsByDateRange(db, startDate, endDate, { ...baseDbFilters, limit });
  } else if (startDate !== undefined) {
    needsLocalStartDateFilter = true;
    results = await getAllTransactions(db, baseDbFilters);
  } else if (endDate !== undefined) {
    needsLocalEndDateFilter = true;
    results = await getAllTransactions(db, baseDbFilters);
  } else {
    return await getAllTransactions(db, { ...baseDbFilters, limit });
  }

  if (needsLocalCategoryFilter && categoryId !== undefined) {
    results = results.filter(
      (transaction) =>
        transaction.categoryId === categoryId ||
        (transaction.splits ?? []).some((split) => split.categoryId === categoryId),
    );
  }

  if (needsLocalStartDateFilter && startDate !== undefined) {
    results = results.filter((transaction) => transaction.date >= startDate);
  }

  if (needsLocalEndDateFilter && endDate !== undefined) {
    results = results.filter((transaction) => transaction.date <= endDate);
  }

  if (limit !== undefined) {
    results = results.slice(0, limit);
  }

  return results;
}

export interface UseTransactionsResult {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  createTransaction: (input: CreateTransactionInput) => Promise<Transaction | null>;
  updateTransaction: (
    transactionId: SyncId,
    updates: UpdateTransactionInput,
  ) => Promise<Transaction | null>;
  deleteTransaction: (transactionId: SyncId) => Promise<boolean>;
}

export function useTransactions(filters: TransactionFilters = {}): UseTransactionsResult {
  const db = useDatabase();
  const [mutationError, setMutationError] = useState<string | null>(null);
  const filtersKey = JSON.stringify(filters);
  const parsedFilters = useMemo(() => JSON.parse(filtersKey) as TransactionFilters, [filtersKey]);
  const runTransactionQuery = useCallback(
    (database: AsyncDb) => applyTransactionFilters(database, parsedFilters),
    [parsedFilters],
  );

  const {
    data: transactions,
    loading,
    error: liveError,
    refresh,
  } = useLiveQuery<Transaction[]>('SELECT id FROM transactions WHERE deleted_at IS NULL', [], {
    initialData: [],
    tables: ['transactions', 'accounts', 'categories'],
    queryFn: runTransactionQuery,
    errorFallback: 'Failed to load transactions.',
  });

  const error = mutationError ?? liveError;

  const createTransaction = useCallback(
    async (input: CreateTransactionInput): Promise<Transaction | null> => {
      try {
        setMutationError(null);
        return await repoCreateTransaction(db, input);
      } catch (transactionError) {
        setMutationError(
          transactionError instanceof Error
            ? transactionError.message
            : 'Failed to create transaction.',
        );
        return null;
      }
    },
    [db],
  );

  const updateTransaction = useCallback(
    async (transactionId: SyncId, updates: UpdateTransactionInput): Promise<Transaction | null> => {
      try {
        setMutationError(null);
        return await repoUpdateTransaction(db, transactionId, updates);
      } catch (transactionError) {
        setMutationError(
          transactionError instanceof Error
            ? transactionError.message
            : 'Failed to update transaction.',
        );
        return null;
      }
    },
    [db],
  );

  const deleteTransaction = useCallback(
    async (transactionId: SyncId): Promise<boolean> => {
      try {
        setMutationError(null);
        return await repoDeleteTransaction(db, transactionId);
      } catch (transactionError) {
        setMutationError(
          transactionError instanceof Error
            ? transactionError.message
            : 'Failed to delete transaction.',
        );
        return false;
      }
    },
    [db],
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
