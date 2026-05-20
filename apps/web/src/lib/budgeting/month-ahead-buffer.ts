// SPDX-License-Identifier: BUSL-1.1

/**
 * Month-ahead buffer goal engine.
 *
 * Calculates progress toward building a one-month expense buffer,
 * projects completion date based on monthly contributions, and
 * tracks whether the goal is complete.
 *
 * All amounts are integer cents. Division is guarded against zero.
 *
 * References: #1568
 */

import type { MonthAheadBufferConfig, MonthAheadBufferProgress } from './advanced-types';
import { addMonths, formatDate } from './utils';

// ---------------------------------------------------------------------------
// Progress calculation
// ---------------------------------------------------------------------------

/**
 * Calculate progress toward the month-ahead buffer goal.
 *
 * @param config - Buffer goal configuration.
 * @param todayStr - Today's date (ISO 8601). Defaults to current UTC date.
 * @returns A {@link MonthAheadBufferProgress} report.
 */
export function calculateBufferProgress(
  config: MonthAheadBufferConfig,
  todayStr?: string,
): MonthAheadBufferProgress {
  const today = todayStr ?? formatDate(new Date());
  const remainingCents = Math.max(0, config.targetCents - config.currentCents);
  const isComplete = remainingCents === 0;

  // Progress percentage (capped at 100)
  const progressPercent =
    config.targetCents > 0
      ? Math.min(100, Math.round((config.currentCents / config.targetCents) * 100))
      : config.currentCents >= 0
        ? 100
        : 0;

  // Estimated months to completion
  let estimatedMonthsToCompletion: number | null = null;
  let projectedCompletionDate: string | null = null;

  if (!isComplete && config.monthlyContributionCents > 0) {
    estimatedMonthsToCompletion = Math.ceil(remainingCents / config.monthlyContributionCents);
    projectedCompletionDate = addMonths(today, estimatedMonthsToCompletion);
  }

  return {
    targetCents: config.targetCents,
    currentCents: config.currentCents,
    remainingCents,
    progressPercent,
    isComplete,
    estimatedMonthsToCompletion,
    projectedCompletionDate,
  };
}

// ---------------------------------------------------------------------------
// Buffer target estimation
// ---------------------------------------------------------------------------

/**
 * Estimate a buffer target from average monthly expenses.
 *
 * @param monthlyExpensesCents - Array of monthly expense totals in cents.
 * @returns Recommended buffer target in cents (average of provided months),
 *          or 0 if the array is empty.
 */
export function estimateBufferTarget(monthlyExpensesCents: readonly number[]): number {
  if (monthlyExpensesCents.length === 0) return 0;

  const total = monthlyExpensesCents.reduce((sum, e) => sum + e, 0);
  return Math.round(total / monthlyExpensesCents.length);
}

/**
 * Calculate the recommended monthly contribution to reach the buffer
 * goal within a specified number of months.
 *
 * @param remainingCents - Amount still needed in cents.
 * @param targetMonths - Number of months to reach the goal.
 * @returns Monthly contribution in cents, or the full remaining if targetMonths ≤ 0.
 */
export function recommendedContribution(remainingCents: number, targetMonths: number): number {
  if (remainingCents <= 0) return 0;
  if (targetMonths <= 0) return remainingCents;
  return Math.ceil(remainingCents / targetMonths);
}
