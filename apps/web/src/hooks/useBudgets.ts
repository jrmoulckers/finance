// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for accessing and mutating budget data.
 *
 * All budgets are loaded enriched with their calculated spending and remaining
 * amounts via {@link getBudgetWithSpending}. Mutations (create, update, delete,
 * reorder) automatically propagate through the live query layer so the
 * spending totals stay accurate across tabs and devices.
 *
 * Usage:
 * ```tsx
 * const { budgets, loading, error, createBudget, refresh } = useBudgets();
 * ```
 *
 * References: issue #443
 */

import { useCallback, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import {
  createBudget as repoCreateBudget,
  deleteBudget as repoDeleteBudget,
  getAllBudgets,
  getBudgetWithSpending,
  reorderBudgets as repoReorderBudgets,
  type BudgetWithSpending,
  updateBudget as repoUpdateBudget,
  type CreateBudgetInput,
  type UpdateBudgetInput,
} from '../db/repositories/budgets';
import type { SqliteDb } from '../db/sqlite-wasm';
import type { Budget, SyncId } from '../kmp/bridge';
import { useLiveQuery } from './useLiveQuery';

export interface UseBudgetsResult {
  budgets: BudgetWithSpending[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  createBudget: (input: CreateBudgetInput) => Budget | null;
  updateBudget: (budgetId: SyncId, updates: UpdateBudgetInput) => Budget | null;
  deleteBudget: (budgetId: SyncId) => boolean;
  reorderBudgets: (fromIndex: number, toIndex: number) => void;
}

function loadBudgetsWithSpending(db: SqliteDb): BudgetWithSpending[] {
  const budgets = getAllBudgets(db);

  return budgets.map((budget): BudgetWithSpending => {
    const enriched = getBudgetWithSpending(db, budget.id);
    if (enriched) {
      return enriched;
    }

    return {
      ...budget,
      spentAmount: { amount: 0 },
      remainingAmount: { amount: budget.amount.amount },
    };
  });
}

export function useBudgets(): UseBudgetsResult {
  const db = useDatabase();
  const [mutationError, setMutationError] = useState<string | null>(null);
  const runBudgetQuery = useCallback((database: SqliteDb) => loadBudgetsWithSpending(database), []);
  const {
    data: budgets,
    loading,
    error: liveError,
    refresh,
  } = useLiveQuery<BudgetWithSpending[]>('SELECT id FROM budget WHERE deleted_at IS NULL', [], {
    initialData: [],
    tables: ['budget', 'transaction'],
    queryFn: runBudgetQuery,
  });

  const error = mutationError ?? liveError;

  const createBudget = useCallback(
    (input: CreateBudgetInput): Budget | null => {
      try {
        setMutationError(null);
        return repoCreateBudget(db, {
          ...input,
          sortOrder: budgets.length,
        });
      } catch (budgetError) {
        setMutationError(
          budgetError instanceof Error ? budgetError.message : 'Failed to create budget.',
        );
        return null;
      }
    },
    [budgets.length, db],
  );

  const updateBudget = useCallback(
    (budgetId: SyncId, updates: UpdateBudgetInput): Budget | null => {
      try {
        setMutationError(null);
        return repoUpdateBudget(db, budgetId, updates);
      } catch (budgetError) {
        setMutationError(
          budgetError instanceof Error ? budgetError.message : 'Failed to update budget.',
        );
        return null;
      }
    },
    [db],
  );

  const deleteBudget = useCallback(
    (budgetId: SyncId): boolean => {
      try {
        setMutationError(null);
        return repoDeleteBudget(db, budgetId);
      } catch (budgetError) {
        setMutationError(
          budgetError instanceof Error ? budgetError.message : 'Failed to delete budget.',
        );
        return false;
      }
    },
    [db],
  );

  const reorderBudgets = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= budgets.length ||
        toIndex >= budgets.length
      ) {
        return;
      }

      const reordered = [...budgets];
      const [movedBudget] = reordered.splice(fromIndex, 1);
      if (!movedBudget) {
        return;
      }
      reordered.splice(toIndex, 0, movedBudget);

      try {
        setMutationError(null);
        repoReorderBudgets(
          db,
          reordered.map((budget) => budget.id),
        );
      } catch (budgetError) {
        setMutationError(
          budgetError instanceof Error ? budgetError.message : 'Failed to reorder budgets.',
        );
      }
    },
    [budgets, db],
  );

  return {
    budgets,
    loading,
    error,
    refresh,
    createBudget,
    updateBudget,
    deleteBudget,
    reorderBudgets,
  };
}
