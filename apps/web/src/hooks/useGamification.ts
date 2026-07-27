// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for gamification state.
 *
 * Computes achievements, streaks, and milestones from financial data.
 *
 * Usage:
 * ```tsx
 * const { state, loading, error } = useGamification();
 * ```
 */

import { useCallback, useEffect, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import { getAllAccounts } from '../db/repositories/accounts';
import { getAllGoals } from '../db/repositories/goals';
import { getAllBudgets, getBudgetWithSpending } from '../db/repositories/budgets';
import { getAllTransactions } from '../db/repositories/transactions';
import {
  computeGamification,
  type GamificationInput,
  type GamificationState,
} from '../components/gamification/achievements-engine';
import { computeCurrentNetWorth } from '../lib/analytics/net-worth';
import { computeLoggingStreak } from '../lib/gamification/logging-streak';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Shape returned by {@link useGamification}. */
export interface UseGamificationResult {
  /** Complete gamification state or null before first load. */
  state: GamificationState | null;
  /** True while computing. */
  loading: boolean;
  /** Human-readable error or null. */
  error: string | null;
  /** Trigger re-computation. */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGamification(): UseGamificationResult {
  const db = useDatabase();

  const [state, setState] = useState<GamificationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshToken((t) => t + 1);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    let cancelled = false;

    async function run(): Promise<void> {
      try {
        const accounts = await getAllAccounts(db);
        const goals = await getAllGoals(db);
        const budgets = await getAllBudgets(db);
        const transactions = await getAllTransactions(db);

        // Daily logging streak. Transaction dates are stored as *local* calendar
        // dates, so the streak anchors to the local "today"/"yesterday" and
        // avoids the UTC off-by-one that affects evening logging in western zones.
        const txDates = new Set(transactions.map((tx) => tx.date));
        const {
          current: dailyLoggingStreak,
          longest: longestDailyLoggingStreak,
          loggedToday,
        } = computeLoggingStreak(txDates);

        // Budget adherence: count budgets where spending <= budget amount
        let budgetAdherenceMonths = 0;
        let currentBudgetRatio = 0;
        if (budgets.length > 0) {
          let totalBudgeted = 0;
          let totalSpent = 0;
          for (const budget of budgets) {
            const withSpending = await getBudgetWithSpending(db, budget.id);
            if (withSpending) {
              totalBudgeted += withSpending.amount.amount;
              totalSpent += withSpending.spentAmount.amount;
              if (withSpending.spentAmount.amount <= withSpending.amount.amount) {
                budgetAdherenceMonths++;
              }
            }
          }
          currentBudgetRatio = totalBudgeted > 0 ? totalSpent / totalBudgeted : 0;
        }

        // Goal progress
        const goalsCompleted = goals.filter(
          (g) => g.targetAmount.amount > 0 && g.currentAmount.amount >= g.targetAmount.amount,
        ).length;

        const totalSaved = goals.reduce((sum, g) => sum + g.currentAmount.amount, 0);

        const categoriesUsed = new Set(
          transactions.filter((tx) => tx.categoryId).map((tx) => tx.categoryId),
        ).size;

        const input: GamificationInput = {
          transactionCount: transactions.length,
          budgetAdherenceMonths,
          budgetCount: budgets.length,
          currentBudgetRatio,
          goalCount: goals.length,
          goalsCompleted,
          goalProgress: goals.map((g) => ({
            goalId: g.id,
            goalName: g.name,
            currentAmount: g.currentAmount.amount,
            targetAmount: g.targetAmount.amount,
          })),
          dailyLoggingStreak,
          longestDailyLoggingStreak,
          // Net worth must subtract liabilities (credit cards, loans) rather
          // than summing every balance as a positive asset. Reuse the canonical
          // helper so achievement thresholds match the /net-worth screen.
          netWorth: computeCurrentNetWorth(accounts).netWorth,
          accountCount: accounts.length,
          totalSaved,
          categoriesUsed,
          loggedToday,
        };

        if (!cancelled) {
          setState(computeGamification(input));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to compute achievements.');
          setState(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [db, refreshToken]);

  return { state, loading, error, refresh };
}
