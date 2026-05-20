// SPDX-License-Identifier: BUSL-1.1

/**
 * Sinking fund / true-expense calculation engine.
 *
 * Amortizes annual, quarterly, or irregular expenses into per-period
 * contribution amounts so users can save incrementally.
 *
 * All amounts are integer cents. Division uses banker's rounding.
 * Division by zero is guarded.
 *
 * References: #1562
 */

import type { SinkingFund, SinkingFundSchedule } from './advanced-types';
import { SinkingFundCadence } from './advanced-types';
import { bankersRound, daysBetween, formatDate } from './utils';

// ---------------------------------------------------------------------------
// Cadence → periods-per-year lookup
// ---------------------------------------------------------------------------

/** Number of contribution periods per year for each cadence. */
const PERIODS_PER_YEAR: Record<SinkingFundCadence, number> = {
  [SinkingFundCadence.WEEKLY]: 52,
  [SinkingFundCadence.BIWEEKLY]: 26,
  [SinkingFundCadence.MONTHLY]: 12,
  [SinkingFundCadence.QUARTERLY]: 4,
  [SinkingFundCadence.SEMI_ANNUALLY]: 2,
  [SinkingFundCadence.ANNUALLY]: 1,
};

/**
 * Get the approximate number of days per period for a given cadence.
 *
 * @param cadence - The contribution cadence.
 * @returns Approximate days per period.
 */
function daysPerPeriod(cadence: SinkingFundCadence): number {
  const periodsPerYear = PERIODS_PER_YEAR[cadence];
  return Math.round(365 / periodsPerYear);
}

// ---------------------------------------------------------------------------
// Schedule calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the contribution schedule for a sinking fund.
 *
 * Determines how many contribution periods remain until the due date
 * and how much must be contributed per period to reach the target.
 *
 * @param fund - The sinking fund definition.
 * @param todayStr - Today's date (ISO 8601). Defaults to current UTC date.
 * @returns A {@link SinkingFundSchedule} with contribution details.
 */
export function calculateSinkingFundSchedule(
  fund: SinkingFund,
  todayStr?: string,
): SinkingFundSchedule {
  const today = todayStr ?? formatDate(new Date());
  const remainingCents = Math.max(0, fund.targetCents - fund.savedCents);

  const daysUntilDue = daysBetween(today, fund.dueDate);
  const periodDays = daysPerPeriod(fund.cadence);

  // Guard: if due date is today or past, or period length is zero
  const periodsRemaining = periodDays > 0 ? Math.max(0, Math.floor(daysUntilDue / periodDays)) : 0;

  const contributionPerPeriodCents =
    periodsRemaining > 0 ? bankersRound(remainingCents / periodsRemaining) : remainingCents;

  // Calculate expected savings at this point in time
  const totalPeriods = calculateTotalPeriods(fund);
  const elapsedPeriods = Math.max(0, totalPeriods - periodsRemaining);
  const expectedPerPeriod =
    totalPeriods > 0 ? bankersRound(fund.targetCents / totalPeriods) : fund.targetCents;
  const expectedSavedCents = Math.min(fund.targetCents, expectedPerPeriod * elapsedPeriods);

  return {
    fundId: fund.id,
    name: fund.name,
    remainingCents,
    periodsRemaining,
    contributionPerPeriodCents,
    onTrack: fund.savedCents >= expectedSavedCents,
    expectedSavedCents,
  };
}

/**
 * Calculate the total number of contribution periods for a fund
 * based on its cadence and a one-year planning horizon.
 *
 * @param fund - The sinking fund.
 * @returns Total planned periods.
 */
function calculateTotalPeriods(fund: SinkingFund): number {
  return PERIODS_PER_YEAR[fund.cadence];
}

// ---------------------------------------------------------------------------
// Monthly amortization
// ---------------------------------------------------------------------------

/**
 * Calculate the monthly contribution for a non-monthly expense.
 *
 * Useful for converting annual/quarterly/semi-annual expenses into
 * a monthly saving target.
 *
 * @param totalCents - Total expense amount in cents.
 * @param cadence - How often the expense occurs.
 * @returns Monthly contribution in cents (banker's rounded).
 */
export function monthlyAmortization(totalCents: number, cadence: SinkingFundCadence): number {
  const periodsPerYear = PERIODS_PER_YEAR[cadence];

  // Annual cost = totalCents × periodsPerYear, then divide by 12
  // Simplified: totalCents × periodsPerYear / 12
  if (cadence === SinkingFundCadence.MONTHLY) {
    return totalCents; // Already monthly
  }

  const annualCents = totalCents * periodsPerYear;
  return bankersRound(annualCents / 12);
}

/**
 * Calculate all sinking fund schedules from a list of funds.
 *
 * @param funds - Array of sinking funds.
 * @param todayStr - Today's date (ISO 8601).
 * @returns Array of schedules, one per fund.
 */
export function calculateAllSchedules(
  funds: readonly SinkingFund[],
  todayStr?: string,
): readonly SinkingFundSchedule[] {
  return funds.map((f) => calculateSinkingFundSchedule(f, todayStr));
}
