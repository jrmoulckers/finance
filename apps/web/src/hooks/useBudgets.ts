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
  createBudgetTemplate as repoCreateBudgetTemplate,
  deleteBudget as repoDeleteBudget,
  getAllBudgets,
  getBudgetSpendingBreakdown as repoGetBudgetSpendingBreakdown,
  getBudgetWithSpending,
  reorderBudgets as repoReorderBudgets,
  updateBudget as repoUpdateBudget,
  type BudgetSpendingBreakdownItem,
  type BudgetWithSpending,
  type CreateBudgetInput,
  type CreateBudgetTemplateInput,
  type UpdateBudgetInput,
} from '../db/repositories/budgets';
import type { AsyncDb } from '../db/async-db';
import type { Budget, SyncId } from '../kmp/bridge';
import { useLiveQuery } from './useLiveQuery';

export interface UseBudgetsResult {
  budgets: BudgetWithSpending[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  createBudget: (input: CreateBudgetInput) => Promise<Budget | null>;
  /**
   * Create a full starter budget from a template and automatically refresh the list.
   * @returns The created budgets, or `null` if creation failed.
   */
  createBudgetTemplate: (input: CreateBudgetTemplateInput) => Promise<Budget[] | null>;
  /**
   * Update an existing budget and automatically refresh the list.
   * @returns The updated budget, or `null` if the budget was not found or update failed.
   */
  updateBudget: (budgetId: SyncId, updates: UpdateBudgetInput) => Promise<Budget | null>;
  deleteBudget: (budgetId: SyncId) => Promise<boolean>;
  reorderBudgets: (fromIndex: number, toIndex: number) => Promise<void>;
  /** Read the current spending breakdown for a budget's category tree. */
  getBudgetSpendingBreakdown: (budgetId: SyncId) => Promise<BudgetSpendingBreakdownItem[]>;
}

/** Normalised budget snapshot used by the household scorecard UI. */
export interface ScorecardBudgetSnapshot {
  readonly id: SyncId;
  readonly householdId: SyncId;
  readonly categoryId: SyncId;
  readonly name: string;
  readonly budgetAmount: number;
  readonly spentAmount: number;
}

const EMPTY_BUDGET_QUERY_PARAMS: readonly unknown[] = [];
const EMPTY_BUDGETS: BudgetWithSpending[] = [];
const BUDGET_LIVE_QUERY_TABLES = ['budgets', 'transactions'] as const;

const SCORECARD_DEMO_BUDGETS: readonly Omit<ScorecardBudgetSnapshot, 'householdId'>[] = [
  {
    id: 'demo-budget-groceries',
    categoryId: 'demo-category-groceries',
    name: 'Groceries',
    budgetAmount: 90000,
    spentAmount: 36000,
  },
  {
    id: 'demo-budget-dining-out',
    categoryId: 'demo-category-dining-out',
    name: 'Dining Out',
    budgetAmount: 45000,
    spentAmount: 28000,
  },
  {
    id: 'demo-budget-entertainment',
    categoryId: 'demo-category-entertainment',
    name: 'Entertainment',
    budgetAmount: 25000,
    spentAmount: 9000,
  },
];

/**
 * Return budget snapshots for the household scorecard.
 *
 * If the current household has no matching budgets yet, the helper falls back
 * to any loaded budgets and finally to deterministic demo data so the local-
 * first household experience still has a useful scorecard.
 */
export function getScorecardBudgetSnapshots(
  budgets: BudgetWithSpending[],
  householdId?: SyncId | null,
): ScorecardBudgetSnapshot[] {
  const matchingBudgets = householdId
    ? budgets.filter((budget) => budget.householdId === householdId)
    : [];
  const sourceBudgets = matchingBudgets.length > 0 ? matchingBudgets : budgets;

  if (sourceBudgets.length > 0) {
    return sourceBudgets.map((budget) => ({
      id: budget.id,
      householdId: budget.householdId,
      categoryId: budget.categoryId,
      name: budget.name,
      budgetAmount: budget.amount.amount,
      spentAmount: budget.spentAmount.amount,
    }));
  }

  const fallbackHouseholdId = householdId ?? 'demo-household';
  return SCORECARD_DEMO_BUDGETS.map((budget) => ({
    ...budget,
    householdId: fallbackHouseholdId,
  }));
}

async function loadBudgetsWithSpending(db: AsyncDb): Promise<BudgetWithSpending[]> {
  try {
    const budgets = await getAllBudgets(db);

    return await Promise.all(
      budgets.map(async (budget): Promise<BudgetWithSpending> => {
        const enriched = await getBudgetWithSpending(db, budget.id);
        if (enriched) {
          return enriched;
        }

        return {
          ...budget,
          spentAmount: { amount: 0 },
          remainingAmount: { amount: budget.amount.amount },
        };
      }),
    );
  } catch (budgetError) {
    if (budgetError instanceof Error) {
      throw budgetError;
    }
    throw new Error('Failed to load budgets.', { cause: budgetError });
  }
}

export function useBudgets(): UseBudgetsResult {
  const db = useDatabase();
  const [mutationError, setMutationError] = useState<string | null>(null);
  const runBudgetQuery = useCallback((database: AsyncDb) => loadBudgetsWithSpending(database), []);
  const {
    data: budgets,
    loading,
    error: liveError,
    refresh: refreshLiveQuery,
  } = useLiveQuery<BudgetWithSpending[]>(
    'SELECT id FROM budgets WHERE deleted_at IS NULL',
    EMPTY_BUDGET_QUERY_PARAMS,
    {
      initialData: EMPTY_BUDGETS,
      tables: BUDGET_LIVE_QUERY_TABLES,
      queryFn: runBudgetQuery,
    },
  );

  const error = mutationError ?? liveError;

  const refresh = useCallback(async () => {
    try {
      setMutationError(null);
      await runBudgetQuery(db);
    } catch (budgetError) {
      setMutationError(
        budgetError instanceof Error ? budgetError.message : 'Failed to load budgets.',
      );
    }
    refreshLiveQuery();
  }, [db, refreshLiveQuery, runBudgetQuery]);

  const createBudget = useCallback(
    async (input: CreateBudgetInput): Promise<Budget | null> => {
      try {
        setMutationError(null);
        const created = await repoCreateBudget(db, {
          ...input,
          sortOrder: budgets.length,
        });
        await refresh();
        return created;
      } catch (budgetError) {
        setMutationError(
          budgetError instanceof Error ? budgetError.message : 'Failed to create budget.',
        );
        return null;
      }
    },
    [budgets.length, db, refresh],
  );

  const createBudgetTemplate = useCallback(
    async (input: CreateBudgetTemplateInput): Promise<Budget[] | null> => {
      try {
        const created = await repoCreateBudgetTemplate(db, input);
        await refresh();
        return created;
      } catch (err) {
        setMutationError(err instanceof Error ? err.message : 'Failed to create starter budget.');
        return null;
      }
    },
    [db, refresh],
  );

  const updateBudget = useCallback(
    async (budgetId: SyncId, updates: UpdateBudgetInput): Promise<Budget | null> => {
      try {
        setMutationError(null);
        const updated = await repoUpdateBudget(db, budgetId, updates);
        if (updated !== null) {
          await refresh();
        }
        return updated;
      } catch (budgetError) {
        setMutationError(
          budgetError instanceof Error ? budgetError.message : 'Failed to update budget.',
        );
        return null;
      }
    },
    [db, refresh],
  );

  const deleteBudget = useCallback(
    async (budgetId: SyncId): Promise<boolean> => {
      try {
        setMutationError(null);
        const deleted = await repoDeleteBudget(db, budgetId);
        if (deleted) {
          await refresh();
        }
        return deleted;
      } catch (budgetError) {
        setMutationError(
          budgetError instanceof Error ? budgetError.message : 'Failed to delete budget.',
        );
        return false;
      }
    },
    [db, refresh],
  );

  const reorderBudgets = useCallback(
    async (fromIndex: number, toIndex: number): Promise<void> => {
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
        await repoReorderBudgets(
          db,
          reordered.map((budget) => budget.id),
        );
        await refresh();
      } catch (budgetError) {
        setMutationError(
          budgetError instanceof Error ? budgetError.message : 'Failed to reorder budgets.',
        );
      }
    },
    [budgets, db, refresh],
  );

  const getBudgetSpendingBreakdown = useCallback(
    async (budgetId: SyncId): Promise<BudgetSpendingBreakdownItem[]> => {
      try {
        return await repoGetBudgetSpendingBreakdown(db, budgetId);
      } catch (err) {
        setMutationError(err instanceof Error ? err.message : 'Failed to load budget breakdown.');
        return [];
      }
    },
    [db],
  );

  return {
    budgets,
    loading,
    error,
    refresh,
    createBudget,
    createBudgetTemplate,
    updateBudget,
    deleteBudget,
    getBudgetSpendingBreakdown,
    reorderBudgets,
  };
}
