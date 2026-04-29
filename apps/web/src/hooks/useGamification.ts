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

    try {
      const accounts = getAllAccounts(db);
      const goals = getAllGoals(db);
      const budgets = getAllBudgets(db);
      const transactions = getAllTransactions(db);

      // Compute daily logging streak from transaction dates
      const txDates = new Set(transactions.map((tx) => tx.date));
      const sortedDates = Array.from(txDates).sort().reverse();

      let dailyLoggingStreak = 0;
      let longestDailyLoggingStreak = 0;

      if (sortedDates.length > 0) {
        // Count current streak from today backwards
        const today = new Date();
        const checkDate = new Date(today);
        let currentStreak = 0;

        for (let i = 0; i < 365; i++) {
          const dateStr = checkDate.toISOString().slice(0, 10);
          if (txDates.has(dateStr)) {
            currentStreak++;
          } else if (currentStreak > 0) {
            break;
          }
          checkDate.setDate(checkDate.getDate() - 1);
        }

        dailyLoggingStreak = currentStreak;

        // Compute longest streak
        let tempStreak = 0;
        for (let i = 0; i < sortedDates.length; i++) {
          if (i === 0) {
            tempStreak = 1;
          } else {
            const prev = new Date(`${sortedDates[i - 1]}T00:00:00`);
            const curr = new Date(`${sortedDates[i]}T00:00:00`);
            const diffDays = Math.round((prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays === 1) {
              tempStreak++;
            } else {
              tempStreak = 1;
            }
          }
          longestDailyLoggingStreak = Math.max(longestDailyLoggingStreak, tempStreak);
        }
      }

      // Budget adherence: count budgets where spending <= budget amount
      let budgetAdherenceMonths = 0;
      let currentBudgetRatio = 0;
      if (budgets.length > 0) {
        let totalBudgeted = 0;
        let totalSpent = 0;
        for (const budget of budgets) {
          const withSpending = getBudgetWithSpending(db, budget.id);
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
        netWorth: accounts.reduce((sum, a) => sum + a.currentBalance.amount, 0),
        accountCount: accounts.length,
        totalSaved,
        categoriesUsed,
      };

      setState(computeGamification(input));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compute achievements.');
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [db, refreshToken]);

  return { state, loading, error, refresh };
}
