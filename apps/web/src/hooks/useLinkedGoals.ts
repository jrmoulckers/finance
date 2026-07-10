// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for linked-account savings goals with automatic progress.
 *
 * Computes progress, milestones, contribution pace, and projected
 * completion for savings goals, optionally linked to accounts.
 *
 * Usage:
 * ```tsx
 * const { linkedGoals, loading, error } = useLinkedGoals();
 * ```
 *
 * References: #1644
 */

import { useMemo } from 'react';
import { useGoals } from './useGoals';
import { useAccounts } from './useAccounts';
import { useDatabase } from '../db/DatabaseProvider';
import { getGoalProgressContributions } from '../db/repositories/goals';
import { buildLinkedGoal, type LinkedGoal, type GoalContribution } from '../lib/planning';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Shape returned by {@link useLinkedGoals}. */
export interface UseLinkedGoalsResult {
  /** All goals with computed progress, milestones, and projections. */
  linkedGoals: LinkedGoal[];
  /** Whether data is loading. */
  loading: boolean;
  /** Error message, if any. */
  error: string | null;
  /** Refresh goal and account data. */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Load savings goals with linked-account progress tracking. */
export function useLinkedGoals(): UseLinkedGoalsResult {
  const db = useDatabase();
  const { goals, loading: goalsLoading, error: goalsError, refresh: refreshGoals } = useGoals();
  const { accounts, loading: accountsLoading, refresh: refreshAccounts } = useAccounts();

  const linkedGoals = useMemo<LinkedGoal[]>(() => {
    return goals.map((goal) => {
      // Find linked account if any
      const linkedAccount = goal.accountId
        ? (accounts.find((a) => a.id === goal.accountId) ?? null)
        : null;

      // Use the goal's real, dated contribution history from
      // `goal_progress_contribution` so pace and projection reflect how the
      // balance actually accumulated over time — not a single lump sum synthesised
      // from the current balance (#3381). buildLinkedGoal treats fewer than two
      // contributions as insufficient history.
      let contributions: GoalContribution[];
      try {
        contributions = getGoalProgressContributions(db, goal.id);
      } catch {
        contributions = [];
      }

      return buildLinkedGoal(
        {
          id: goal.id,
          name: goal.name,
          targetCents: goal.targetAmount.amount,
          currentCents: goal.currentAmount.amount,
          accountId: goal.accountId,
        },
        linkedAccount?.currentBalance.amount ?? null,
        linkedAccount?.name ?? null,
        contributions,
      );
    });
  }, [db, goals, accounts]);

  const refresh = () => {
    refreshGoals();
    refreshAccounts();
  };

  return {
    linkedGoals,
    loading: goalsLoading || accountsLoading,
    error: goalsError,
    refresh,
  };
}
