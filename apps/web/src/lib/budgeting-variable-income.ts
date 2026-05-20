// SPDX-License-Identifier: BUSL-1.1

/**
 * Variable-income analysis engine.
 *
 * Provides statistical analysis of irregular income streams, including
 * income averaging, variability scoring, and emergency buffer calculation.
 *
 * All monetary values are integer cents. Statistical results that involve
 * division use banker's rounding for consistency.
 *
 * References: issue #1566
 */

import type { VariableIncomeAnalysis } from './budgeting-types';
import { bankersRound } from './budgeting-zero-based';

// ---------------------------------------------------------------------------
// Statistical helpers
// ---------------------------------------------------------------------------

/**
 * Calculate the median of a sorted-or-unsorted array of numbers.
 *
 * For an even-length array the two middle values are averaged with
 * banker's rounding.
 *
 * @param values - Array of numeric values (need not be sorted).
 * @returns The median, or 0 for an empty array.
 */
export function calculateMedian(values: readonly number[]): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }

  return bankersRound((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Calculate the population standard deviation.
 *
 * @param values - Array of numeric values.
 * @param mean   - Pre-computed arithmetic mean.
 * @returns The population standard deviation (banker's rounded to integer),
 *          or 0 when the array has fewer than 2 elements.
 */
export function calculateStdDev(values: readonly number[], mean: number): number {
  if (values.length < 2) return 0;

  const sumSquaredDiffs = values.reduce((sum, v) => sum + (v - mean) ** 2, 0);

  return bankersRound(Math.sqrt(sumSquaredDiffs / values.length));
}

// ---------------------------------------------------------------------------
// Buffer calculation
// ---------------------------------------------------------------------------

/**
 * Calculate how many months of expenses a savings buffer covers.
 *
 * @param savingsCents       - Current savings balance in cents.
 * @param monthlyExpensesCents - Typical monthly expenses in cents.
 * @returns Whole months of runway (floored), or 0 when expenses ≤ 0.
 */
export function calculateBufferMonths(savingsCents: number, monthlyExpensesCents: number): number {
  if (monthlyExpensesCents <= 0) return 0;
  if (savingsCents <= 0) return 0;
  return Math.floor(savingsCents / monthlyExpensesCents);
}

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------

/**
 * Perform a full statistical analysis of variable income.
 *
 * @param incomeHistory      - Array of income amounts in cents (one per period).
 * @param monthlyExpensesCents - Typical monthly expenses in cents (for buffer calc).
 * @param savingsCents        - Current savings balance in cents.
 * @returns A complete {@link VariableIncomeAnalysis}, or a zeroed-out result
 *          when there is no income history.
 */
export function analyseVariableIncome(
  incomeHistory: readonly number[],
  monthlyExpensesCents: number,
  savingsCents: number,
): VariableIncomeAnalysis {
  if (incomeHistory.length === 0) {
    return {
      averageCents: 0,
      medianCents: 0,
      minCents: 0,
      maxCents: 0,
      stdDevCents: 0,
      variabilityPercent: 0,
      bufferMonths: 0,
      conservativeBudgetCents: 0,
    };
  }

  const sum = incomeHistory.reduce((s, v) => s + v, 0);
  const averageCents = bankersRound(sum / incomeHistory.length);
  const medianCents = calculateMedian(incomeHistory);
  const minCents = Math.min(...incomeHistory);
  const maxCents = Math.max(...incomeHistory);
  const stdDevCents = calculateStdDev(incomeHistory, averageCents);

  const variabilityPercent =
    averageCents === 0 ? 0 : bankersRound((stdDevCents / averageCents) * 10_000) / 100;

  const bufferMonths = calculateBufferMonths(savingsCents, monthlyExpensesCents);

  const conservativeBudgetCents = Math.max(0, averageCents - stdDevCents);

  return {
    averageCents,
    medianCents,
    minCents,
    maxCents,
    stdDevCents,
    variabilityPercent,
    bufferMonths,
    conservativeBudgetCents,
  };
}
