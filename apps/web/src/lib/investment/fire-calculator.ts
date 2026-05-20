// SPDX-License-Identifier: BUSL-1.1

/**
 * FIRE (Financial Independence, Retire Early) calculator.
 *
 * Computes FI number, FI percentage, CoastFI, savings rate, and years to FI.
 *
 * All monetary values are integer cents. Percentages use 0–100 scale.
 *
 * References: issues #1675, #1715
 */

import { bankersRound } from './rebalancing';
import type { FIREInput, FIREMetrics } from './types';

// ---------------------------------------------------------------------------
// Core FIRE calculations
// ---------------------------------------------------------------------------

/**
 * Calculate the Financial Independence number.
 *
 * FI Number = Annual Expenses / Withdrawal Rate.
 * At 4% SWR, this equals annual expenses × 25.
 *
 * @param annualExpensesCents - Annual expenses in cents.
 * @param withdrawalRatePercent - Safe withdrawal rate (percentage, e.g. 4).
 * @returns FI number in cents.
 */
export function calculateFINumber(
  annualExpensesCents: number,
  withdrawalRatePercent: number,
): number {
  if (withdrawalRatePercent <= 0) return 0;
  return bankersRound((annualExpensesCents * 100) / withdrawalRatePercent);
}

/**
 * Calculate FI percentage (progress toward FI).
 *
 * FI% = (Current Portfolio / FI Number) × 100.
 *
 * @param currentPortfolioCents - Current portfolio value in cents.
 * @param fiNumberCents - FI number in cents.
 * @returns FI percentage (0–100+, can exceed 100 if over-saved).
 */
export function calculateFIPercent(currentPortfolioCents: number, fiNumberCents: number): number {
  if (fiNumberCents <= 0) return 0;
  return Math.round((currentPortfolioCents / fiNumberCents) * 10000) / 100;
}

/**
 * Calculate CoastFI — the amount needed now to reach FI by retirement
 * with zero additional contributions, relying only on market growth.
 *
 * CoastFI = FI Number / (1 + returnRate)^yearsToRetirement
 *
 * @param fiNumberCents - Target FI number in cents.
 * @param expectedReturnPercent - Expected annual real return (percentage).
 * @param yearsToRetirement - Years until target retirement.
 * @returns CoastFI amount in cents.
 */
export function calculateCoastFI(
  fiNumberCents: number,
  expectedReturnPercent: number,
  yearsToRetirement: number,
): number {
  if (yearsToRetirement <= 0) return fiNumberCents;
  const rate = expectedReturnPercent / 100;
  return bankersRound(fiNumberCents / Math.pow(1 + rate, yearsToRetirement));
}

/**
 * Calculate savings rate.
 *
 * Savings Rate = (Annual Savings / Annual Income) × 100.
 *
 * @param annualSavingsCents - Annual savings in cents.
 * @param annualIncomeCents - Annual gross income in cents.
 * @returns Savings rate as a percentage.
 */
export function calculateSavingsRate(
  annualSavingsCents: number,
  annualIncomeCents: number,
): number {
  if (annualIncomeCents <= 0) return 0;
  return Math.round((annualSavingsCents / annualIncomeCents) * 10000) / 100;
}

/**
 * Estimate years to Financial Independence.
 *
 * Uses the future value of a growing annuity formula to find the number
 * of years where portfolio + accumulated savings + growth = FI number.
 *
 * Iterative approach for accuracy:
 *   Each year: portfolio = portfolio × (1 + r) + annualSavings
 *   Stop when portfolio >= FI number.
 *
 * @param currentPortfolioCents - Current portfolio in cents.
 * @param annualSavingsCents - Annual savings in cents.
 * @param expectedReturnPercent - Expected annual real return (percentage).
 * @param fiNumberCents - Target FI number in cents.
 * @param maxYears - Maximum years to simulate (default 100).
 * @returns Estimated years to FI, or maxYears if unreachable.
 */
export function calculateYearsToFI(
  currentPortfolioCents: number,
  annualSavingsCents: number,
  expectedReturnPercent: number,
  fiNumberCents: number,
  maxYears: number = 100,
): number {
  if (currentPortfolioCents >= fiNumberCents) return 0;
  if (annualSavingsCents <= 0 && expectedReturnPercent <= 0) return maxYears;

  const rate = expectedReturnPercent / 100;
  let portfolio = currentPortfolioCents;

  for (let year = 1; year <= maxYears; year++) {
    portfolio = portfolio * (1 + rate) + annualSavingsCents;
    if (portfolio >= fiNumberCents) return year;
  }

  return maxYears;
}

// ---------------------------------------------------------------------------
// Full FIRE metrics
// ---------------------------------------------------------------------------

/**
 * Compute all FIRE dashboard metrics from inputs.
 *
 * @param input - FIRE calculation inputs.
 * @returns Complete FIRE metrics for dashboard display.
 */
export function calculateFIREMetrics(input: FIREInput): FIREMetrics {
  const {
    currentPortfolioCents,
    annualExpensesCents,
    annualSavingsCents,
    annualIncomeCents,
    expectedReturnPercent,
    currentAge,
    targetRetirementAge,
    withdrawalRatePercent,
  } = input;

  const fiNumberCents = calculateFINumber(annualExpensesCents, withdrawalRatePercent);

  const fiPercent = calculateFIPercent(currentPortfolioCents, fiNumberCents);

  const yearsToRetirement = Math.max(0, targetRetirementAge - currentAge);
  const coastFICents = calculateCoastFI(fiNumberCents, expectedReturnPercent, yearsToRetirement);

  const isCoastFI = currentPortfolioCents >= coastFICents;

  const savingsRatePercent = calculateSavingsRate(annualSavingsCents, annualIncomeCents);

  const yearsToFI = calculateYearsToFI(
    currentPortfolioCents,
    annualSavingsCents,
    expectedReturnPercent,
    fiNumberCents,
  );

  // Projected FI date
  const today = new Date();
  const fiDate = new Date(today);
  fiDate.setFullYear(fiDate.getFullYear() + yearsToFI);
  const projectedFIDate = fiDate.toISOString().slice(0, 10);

  // Current passive income (what the portfolio could generate at SWR)
  const currentPassiveIncomeCents = bankersRound(
    (currentPortfolioCents * withdrawalRatePercent) / 100,
  );

  // Income replacement
  const incomeReplacementPercent =
    annualExpensesCents > 0
      ? Math.round((currentPassiveIncomeCents / annualExpensesCents) * 10000) / 100
      : 0;

  return {
    fiNumberCents,
    fiPercent,
    coastFICents,
    isCoastFI,
    savingsRatePercent,
    yearsToFI,
    projectedFIDate,
    currentPassiveIncomeCents,
    incomeReplacementPercent,
  };
}
