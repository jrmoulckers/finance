// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for spending pace analysis.
 *
 * Calculates daily spending pace, ahead/behind indicators, predictive
 * overspend warnings, and weekly summaries for all active budgets.
 *
 * Usage:
 * ```tsx
 * const { paces, isLoading } = useSpendingPace(budgets);
 * ```
 *
 * @module hooks/useSpendingPace
 * References: #1648
 */

import { useMemo } from 'react';
import type { BudgetWithSpending } from '../db/repositories/budgets';
import type { SpendingPace } from '../lib/notifications';
import { calculateSpendingPace } from '../lib/notifications';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Estimate the period end date from a budget's start date and period type.
 *
 * Since budgets have explicit start_date and optional end_date, we use
 * end_date when available, otherwise compute from the period.
 */
function estimatePeriodEnd(startDate: string, period: string, endDate: string | null): string {
  if (endDate) return endDate;

  const start = new Date(startDate);
  switch (period) {
    case 'WEEKLY':
      start.setDate(start.getDate() + 7);
      break;
    case 'BIWEEKLY':
      start.setDate(start.getDate() + 14);
      break;
    case 'MONTHLY':
      start.setMonth(start.getMonth() + 1);
      break;
    case 'QUARTERLY':
      start.setMonth(start.getMonth() + 3);
      break;
    case 'YEARLY':
      start.setFullYear(start.getFullYear() + 1);
      break;
    default:
      start.setMonth(start.getMonth() + 1);
  }
  return start.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Shape returned by {@link useSpendingPace}. */
export interface UseSpendingPaceResult {
  /** Spending pace data for each budget. */
  paces: readonly SpendingPace[];
  /** Budgets where overspend is predicted. */
  overspending: readonly SpendingPace[];
  /** Budgets that are under pace. */
  onTrack: readonly SpendingPace[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Calculate spending pace metrics for a set of budgets.
 *
 * @param budgets - Budgets with spending data (from useBudgets hook).
 * @returns Pace analysis for each budget.
 */
export function useSpendingPace(budgets: readonly BudgetWithSpending[]): UseSpendingPaceResult {
  const today = new Date().toISOString().slice(0, 10);

  const paces = useMemo(() => {
    return budgets.map((budget) => {
      const periodEnd = estimatePeriodEnd(budget.startDate, budget.period, budget.endDate);

      return calculateSpendingPace({
        budgetId: budget.id,
        budgetName: budget.name,
        budgetAmountCents: budget.amount.amount,
        spentCents: budget.spentAmount.amount,
        periodStart: budget.startDate,
        periodEnd,
        today,
      });
    });
  }, [budgets, today]);

  const overspending = useMemo(() => paces.filter((p) => p.willOverspend), [paces]);

  const onTrack = useMemo(() => paces.filter((p) => !p.willOverspend), [paces]);

  return { paces, overspending, onTrack };
}
