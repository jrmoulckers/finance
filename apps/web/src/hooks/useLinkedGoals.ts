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

import { useEffect, useMemo, useState } from 'react';
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

  // Contribution history is loaded asynchronously (the repository read is async
  // under the AsyncDb data layer) and keyed by goal id so the memo below can
  // build each LinkedGoal synchronously once the history is available.
  const [contributionsByGoal, setContributionsByGoal] = useState<Map<string, GoalContribution[]>>(
    () => new Map(),
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const entries = await Promise.all(
        goals.map(async (goal) => {
          try {
            const contributions = await getGoalProgressContributions(db, goal.id);
            return [goal.id, contributions] as const;
          } catch {
            return [goal.id, [] as GoalContribution[]] as const;
          }
        }),
      );
      if (!cancelled) setContributionsByGoal(new Map(entries));
    })();

    return () => {
      cancelled = true;
    };
  }, [db, goals]);

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
      const contributions = contributionsByGoal.get(goal.id) ?? [];

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
  }, [goals, accounts, contributionsByGoal]);

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
