// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for generating contextual financial tips.
 *
 * Consumes data from existing hooks (useDashboardData, useGoals, useBudgets)
 * and feeds it through the tips engine to produce relevant advice.
 *
 * Usage:
 * ```tsx
 * const { tips, dismissTip, loading } = useFinancialTips('dashboard');
 * ```
 */

import { useCallback, useMemo, useState } from 'react';
import { useDashboardData } from './useDashboardData';
import { useGoals } from './useGoals';
import { useBudgets } from './useBudgets';
import {
  generateTips,
  dismissTip as persistDismissTip,
  isTipDismissed,
  clearDismissedTips as persistClearDismissedTips,
  type FinancialTip,
  type TipContext,
} from '../components/tips/tips-engine';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Shape returned by {@link useFinancialTips}. */
export interface UseFinancialTipsResult {
  /** Contextual tips sorted by relevance, excluding dismissed tips. */
  tips: FinancialTip[];
  /** `true` while underlying data is still loading. */
  loading: boolean;
  /** Dismiss a tip so it won't appear again. */
  dismissTip: (tipId: string) => void;
  /** Clear all dismissed tips (reset). */
  clearDismissedTips: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Generate contextual financial tips for the given page context.
 *
 * @param context - The page context to filter tips for (e.g., 'dashboard', 'budgets')
 * @param maxTips - Maximum number of tips to show (default: 3)
 */
export function useFinancialTips(
  context?: TipContext,
  maxTips: number = 3,
): UseFinancialTipsResult {
  const { data: dashboardData, loading: dashboardLoading } = useDashboardData();
  const { goals, loading: goalsLoading } = useGoals();
  const { budgets, loading: budgetsLoading } = useBudgets();

  // Track dismissed tips locally so UI updates immediately
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('finance_dismissed_tips');
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  const loading = dashboardLoading || goalsLoading || budgetsLoading;

  const tips = useMemo(() => {
    if (loading || !dashboardData) return [];

    const goalsReached = goals.filter(
      (g) => g.targetAmount.amount > 0 && g.currentAmount.amount >= g.targetAmount.amount,
    ).length;

    const averageGoalProgress =
      goals.length > 0
        ? Math.round(
            goals.reduce((sum, g) => {
              if (g.targetAmount.amount === 0) return sum;
              return sum + Math.min((g.currentAmount.amount / g.targetAmount.amount) * 100, 100);
            }, 0) / goals.length,
          )
        : 0;

    const input = {
      netWorth: dashboardData.netWorth,
      spentThisMonth: dashboardData.spentThisMonth,
      incomeThisMonth: dashboardData.incomeThisMonth,
      monthlyBudget: dashboardData.monthlyBudget,
      budgetSpent: dashboardData.budgetSpent,
      accountCount: dashboardData.accountSummary.length,
      budgetCount: budgets.length,
      goalCount: goals.length,
      transactionCount: dashboardData.recentTransactions.length,
      goalsReached,
      averageGoalProgress,
      dayOfMonth: new Date().getDate(),
    };

    const generated = generateTips(input, context, maxTips + dismissedIds.size);

    return generated
      .filter((tip) => !dismissedIds.has(tip.id) && !isTipDismissed(tip.id))
      .slice(0, maxTips);
  }, [loading, dashboardData, goals, budgets, context, maxTips, dismissedIds]);

  const handleDismissTip = useCallback((tipId: string) => {
    persistDismissTip(tipId);
    setDismissedIds((prev) => new Set([...prev, tipId]));
  }, []);

  const handleClearDismissedTips = useCallback(() => {
    persistClearDismissedTips();
    setDismissedIds(new Set());
  }, []);

  return {
    tips,
    loading,
    dismissTip: handleDismissTip,
    clearDismissedTips: handleClearDismissedTips,
  };
}
