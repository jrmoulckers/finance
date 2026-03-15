// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for accessing and mutating budget data.
 *
 * All budgets are loaded enriched with their calculated spending and remaining
 * amounts via {@link getBudgetWithSpending}.  Mutations (create, update, delete)
 * automatically trigger a refresh so the spending totals stay accurate.
 *
 * Usage:
 * ```tsx
 * const { budgets, loading, error, createBudget, refresh } = useBudgets();
 * ```
 *
 * References: issue #443
 */

import { useCallback, useEffect, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import {
  createBudget as repoCreateBudget,
  deleteBudget as repoDeleteBudget,
  getAllBudgets,
  getBudgetWithSpending,
  updateBudget as repoUpdateBudget,
  type BudgetWithSpending,
  type CreateBudgetInput,
  type UpdateBudgetInput,
} from '../db/repositories/budgets';
import type { Budget, SyncId } from '../kmp/bridge';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Shape returned by {@link useBudgets}. */
export interface UseBudgetsResult {
  /**
   * All non-deleted budgets, each enriched with `spentAmount` and
   * `remainingAmount` calculated from matching transactions.
   */
  budgets: BudgetWithSpending[];
  /** `true` while the initial or refresh load is in progress. */
  loading: boolean;
  /** Human-readable error message from the last failed operation, or `null`. */
  error: string | null;
  /** Trigger a re-fetch of all budgets and their spending totals. */
  refresh: () => void;
  /**
   * Create a new budget and automatically refresh the list.
   * @returns The created budget, or `null` if creation failed.
   */
  createBudget: (input: CreateBudgetInput) => Budget | null;
  /**
   * Update an existing budget and automatically refresh the list.
   * @returns The updated budget, or `null` if the budget was not found or update failed.
   */
  updateBudget: (budgetId: SyncId, updates: UpdateBudgetInput) => Budget | null;
  /**
   * Soft-delete a budget and automatically refresh the list.
   * @returns `true` if deletion succeeded, `false` otherwise.
   */
  deleteBudget: (budgetId: SyncId) => boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load all budgets and enrich each with its spending totals.
 *
 * Falls back gracefully when `getBudgetWithSpending` cannot find a record
 * (e.g. a race between deletion and load), substituting zero spending so the
 * list remains consistent.
 */
function loadBudgetsWithSpending(db: ReturnType<typeof useDatabase>): BudgetWithSpending[] {
  const budgets = getAllBudgets(db);

  return budgets.map((budget): BudgetWithSpending => {
    const enriched = getBudgetWithSpending(db, budget.id);
    if (enriched) {
      return enriched;
    }
    // Fallback: budget exists but spending query returned null (edge case).
    return {
      ...budget,
      spentAmount: { amount: 0 },
      remainingAmount: { amount: budget.amount.amount },
    };
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Load all budgets enriched with spending totals and expose CRUD operations. */
export function useBudgets(): UseBudgetsResult {
  const db = useDatabase();

  const [budgets, setBudgets] = useState<BudgetWithSpending[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  /** Trigger a re-fetch of all budgets. */
  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshToken((t) => t + 1);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      const result = loadBudgetsWithSpending(db);
      setBudgets(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load budgets.');
      setBudgets([]);
    } finally {
      setLoading(false);
    }
  }, [db, refreshToken]);

  const createBudget = useCallback(
    (input: CreateBudgetInput): Budget | null => {
      try {
        const created = repoCreateBudget(db, input);
        refresh();
        return created;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create budget.');
        setLoading(false);
        return null;
      }
    },
    [db, refresh],
  );

  const updateBudget = useCallback(
    (budgetId: SyncId, updates: UpdateBudgetInput): Budget | null => {
      try {
        const updated = repoUpdateBudget(db, budgetId, updates);
        if (updated !== null) {
          refresh();
        }
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update budget.');
        setLoading(false);
        return null;
      }
    },
    [db, refresh],
  );

  const deleteBudget = useCallback(
    (budgetId: SyncId): boolean => {
      try {
        const deleted = repoDeleteBudget(db, budgetId);
        if (deleted) {
          refresh();
        }
        return deleted;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete budget.');
        setLoading(false);
        return false;
      }
    },
    [db, refresh],
  );

  return {
    budgets,
    loading,
    error,
    refresh,
    createBudget,
    updateBudget,
    deleteBudget,
  };
}
