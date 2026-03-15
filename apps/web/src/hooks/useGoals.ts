// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for accessing and mutating savings goal data.
 *
 * Reads from the local SQLite-WASM database via the goals repository.
 * All operations are synchronous against the local DB; errors are captured
 * in state rather than thrown so callers can render gracefully.
 *
 * Usage:
 * ```tsx
 * const { goals, loading, error, createGoal, refresh } = useGoals();
 * ```
 *
 * References: issue #443
 */

import { useCallback, useEffect, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import {
  createGoal as repoCreateGoal,
  deleteGoal as repoDeleteGoal,
  getAllGoals,
  updateGoal as repoUpdateGoal,
  type CreateGoalInput,
  type UpdateGoalInput,
} from '../db/repositories/goals';
import type { Goal, SyncId } from '../kmp/bridge';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Shape returned by {@link useGoals}. */
export interface UseGoalsResult {
  /**
   * All non-deleted goals ordered by target date (earliest first, then
   * goals with no target date, then alphabetically by name).
   */
  goals: Goal[];
  /** `true` while the initial or refresh load is in progress. */
  loading: boolean;
  /** Human-readable error message from the last failed operation, or `null`. */
  error: string | null;
  /** Trigger a re-fetch of all goals from the local database. */
  refresh: () => void;
  /**
   * Create a new savings goal and automatically refresh the list.
   * @returns The created goal, or `null` if creation failed.
   */
  createGoal: (input: CreateGoalInput) => Goal | null;
  /**
   * Update an existing goal and automatically refresh the list.
   * @returns The updated goal, or `null` if the goal was not found or update failed.
   */
  updateGoal: (goalId: SyncId, updates: UpdateGoalInput) => Goal | null;
  /**
   * Soft-delete a goal and automatically refresh the list.
   * @returns `true` if deletion succeeded, `false` otherwise.
   */
  deleteGoal: (goalId: SyncId) => boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Load all savings goals from the local database and expose CRUD operations. */
export function useGoals(): UseGoalsResult {
  const db = useDatabase();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  /** Increment the refresh token to trigger a data re-fetch. */
  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshToken((t) => t + 1);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      const result = getAllGoals(db);
      setGoals(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load goals.');
      setGoals([]);
    } finally {
      setLoading(false);
    }
  }, [db, refreshToken]);

  const createGoal = useCallback(
    (input: CreateGoalInput): Goal | null => {
      try {
        const created = repoCreateGoal(db, input);
        refresh();
        return created;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create goal.');
        setLoading(false);
        return null;
      }
    },
    [db, refresh],
  );

  const updateGoal = useCallback(
    (goalId: SyncId, updates: UpdateGoalInput): Goal | null => {
      try {
        const updated = repoUpdateGoal(db, goalId, updates);
        if (updated !== null) {
          refresh();
        }
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update goal.');
        setLoading(false);
        return null;
      }
    },
    [db, refresh],
  );

  const deleteGoal = useCallback(
    (goalId: SyncId): boolean => {
      try {
        const deleted = repoDeleteGoal(db, goalId);
        if (deleted) {
          refresh();
        }
        return deleted;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete goal.');
        setLoading(false);
        return false;
      }
    },
    [db, refresh],
  );

  return {
    goals,
    loading,
    error,
    refresh,
    createGoal,
    updateGoal,
    deleteGoal,
  };
}
