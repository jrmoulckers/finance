// SPDX-License-Identifier: BUSL-1.1

/**
 * Home purchase readiness tracker.
 *
 * Calculates down payment goals, closing costs, DTI ratios, monthly PITI
 * payments, PMI thresholds, and savings timelines for prospective homebuyers.
 *
 * All monetary values are in integer cents. Rates use basis points (100 = 1%).
 *
 * References: #1652, #1771
 */

import type { HomePurchaseParams, HomePurchaseResult } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** PMI threshold: 20% down payment (2000 bps). */
const PMI_THRESHOLD_BPS = 2000;

/** Default closing cost rate: 3% (300 bps). */
const DEFAULT_CLOSING_COST_BPS = 300;

/**
 * Approximate annual PMI rate in basis points of the loan amount.
 * Typical range is 50–200 bps; we use 80 bps (0.80%) as a midpoint.
 */
const PMI_ANNUAL_RATE_BPS = 80;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Apply Banker's rounding (round half to even) to a number.
 *
 * @param value - The value to round
 * @returns The rounded integer
 */
function bankersRound(value: number): number {
  const floored = Math.floor(value);
  const diff = value - floored;
  if (Math.abs(diff - 0.5) < 1e-10) {
    // Round to even
    return floored % 2 === 0 ? floored : floored + 1;
  }
  return Math.round(value);
}

/**
 * Convert basis points to a decimal rate.
 *
 * @param bps - Rate in basis points
 * @returns Decimal rate (e.g. 700 → 0.07)
 */
function bpsToDecimal(bps: number): number {
  return bps / 10000;
}

/**
 * Calculate months between today and a target date.
 *
 * @param targetDate - ISO-8601 date string
 * @param today - Reference date (defaults to now)
 * @returns Number of months (can be negative if target is in the past)
 */
function monthsBetween(targetDate: string, today: Date = new Date()): number {
  const target = new Date(targetDate);
  return (target.getFullYear() - today.getFullYear()) * 12 + (target.getMonth() - today.getMonth());
}

// ---------------------------------------------------------------------------
// Core calculations
// ---------------------------------------------------------------------------

/**
 * Calculate the required down payment in cents.
 *
 * @param homePriceCents - Home price in cents
 * @param downPaymentBps - Down payment percentage in basis points
 * @returns Down payment in cents
 */
export function calculateDownPayment(homePriceCents: number, downPaymentBps: number): number {
  return bankersRound(homePriceCents * bpsToDecimal(downPaymentBps));
}

/**
 * Estimate closing costs in cents.
 *
 * @param homePriceCents - Home price in cents
 * @param closingCostBps - Closing cost rate in basis points (default 300 = 3%)
 * @returns Estimated closing costs in cents
 */
export function calculateClosingCosts(
  homePriceCents: number,
  closingCostBps: number = DEFAULT_CLOSING_COST_BPS,
): number {
  return bankersRound(homePriceCents * bpsToDecimal(closingCostBps));
}

/**
 * Calculate monthly mortgage payment (principal + interest) using amortisation.
 *
 * Uses the standard formula: M = P × [r(1+r)^n] / [(1+r)^n – 1]
 *
 * @param loanCents - Loan principal in cents
 * @param annualRateBps - Annual interest rate in basis points
 * @param termYears - Loan term in years
 * @returns Monthly P&I payment in cents
 */
export function calculateMonthlyMortgage(
  loanCents: number,
  annualRateBps: number,
  termYears: number,
): number {
  if (loanCents <= 0) return 0;
  const monthlyRate = bpsToDecimal(annualRateBps) / 12;
  if (monthlyRate === 0) {
    return bankersRound(loanCents / (termYears * 12));
  }
  const n = termYears * 12;
  const factor = Math.pow(1 + monthlyRate, n);
  return bankersRound((loanCents * (monthlyRate * factor)) / (factor - 1));
}

/**
 * Estimate monthly PMI cost in cents.
 *
 * PMI is typically required when down payment is less than 20%.
 *
 * @param loanCents - Loan amount in cents
 * @param isRequired - Whether PMI is required
 * @returns Monthly PMI cost in cents
 */
export function calculateMonthlyPmi(loanCents: number, isRequired: boolean): number {
  if (!isRequired) return 0;
  return bankersRound((loanCents * bpsToDecimal(PMI_ANNUAL_RATE_BPS)) / 12);
}

/**
 * Calculate DTI ratio in basis points.
 *
 * @param monthlyDebtCents - Total monthly debt obligations in cents
 * @param monthlyIncomeCents - Gross monthly income in cents
 * @returns DTI ratio in basis points (e.g. 2800 = 28%)
 */
export function calculateDti(monthlyDebtCents: number, monthlyIncomeCents: number): number {
  if (monthlyIncomeCents <= 0) return 0;
  return bankersRound((monthlyDebtCents / monthlyIncomeCents) * 10000);
}

/**
 * Calculate the monthly savings required to accumulate a target amount by a date.
 *
 * @param targetCents - Target amount in cents
 * @param currentCents - Current savings in cents
 * @param months - Months remaining
 * @returns Required monthly savings in cents (null if already met)
 */
export function calculateRequiredMonthlySavings(
  targetCents: number,
  currentCents: number,
  months: number,
): number | null {
  const gap = targetCents - currentCents;
  if (gap <= 0) return null;
  if (months <= 0) return gap; // Need full gap immediately
  return bankersRound(gap / months);
}

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------

/**
 * Perform a complete home purchase readiness analysis.
 *
 * Evaluates down payment adequacy, closing costs, monthly payments,
 * DTI ratios, PMI requirements, and savings timeline.
 *
 * @param params - Home purchase parameters
 * @param today - Reference date for timeline calculations (defaults to now)
 * @returns Complete home purchase analysis result
 */
export function analyzeHomePurchase(
  params: HomePurchaseParams,
  today: Date = new Date(),
): HomePurchaseResult {
  const closingCostBps = params.closingCostBps ?? DEFAULT_CLOSING_COST_BPS;

  // Down payment & closing costs
  const downPaymentCents = calculateDownPayment(params.homePriceCents, params.downPaymentBps);
  const closingCostsCents = calculateClosingCosts(params.homePriceCents, closingCostBps);
  const totalCashNeededCents = downPaymentCents + closingCostsCents;
  const savingsGapCents = Math.max(0, totalCashNeededCents - params.currentSavingsCents);

  // PMI
  const pmiRequired = params.downPaymentBps < PMI_THRESHOLD_BPS;
  const loanCents = params.homePriceCents - downPaymentCents;
  const monthlyPmiCents = calculateMonthlyPmi(loanCents, pmiRequired);

  // Monthly payment
  const monthlyMortgageCents = calculateMonthlyMortgage(
    loanCents,
    params.mortgageRateBps,
    params.loanTermYears,
  );
  const monthlyTaxesCents = bankersRound(
    (params.homePriceCents * bpsToDecimal(params.propertyTaxRateBps)) / 12,
  );
  const monthlyInsuranceCents = bankersRound(params.annualInsuranceCents / 12);
  const monthlyPitiCents = monthlyMortgageCents + monthlyTaxesCents + monthlyInsuranceCents;
  const totalMonthlyHousingCents = monthlyPitiCents + monthlyPmiCents;

  // DTI
  const monthlyIncomeCents = bankersRound(params.annualIncomeCents / 12);
  const frontEndDtiBps = calculateDti(totalMonthlyHousingCents, monthlyIncomeCents);
  const backEndDtiBps = calculateDti(
    totalMonthlyHousingCents + params.existingMonthlyDebtCents,
    monthlyIncomeCents,
  );

  // Timeline
  const months = monthsBetween(params.targetDate, today);
  let monthsToTarget: number | null = null;

  if (savingsGapCents > 0 && params.monthlySavingsCents > 0) {
    monthsToTarget = Math.ceil(savingsGapCents / params.monthlySavingsCents);
  } else if (savingsGapCents > 0) {
    monthsToTarget = null; // Cannot reach target with zero savings
  }

  const requiredMonthlySavingsCents = calculateRequiredMonthlySavings(
    totalCashNeededCents,
    params.currentSavingsCents,
    months,
  );

  const onTrack = savingsGapCents === 0 || (monthsToTarget !== null && monthsToTarget <= months);

  return {
    downPaymentCents,
    closingCostsCents,
    totalCashNeededCents,
    savingsGapCents,
    pmiRequired,
    monthlyPmiCents,
    monthlyMortgageCents,
    monthlyPitiCents,
    totalMonthlyHousingCents,
    frontEndDtiBps,
    backEndDtiBps,
    monthsToTarget,
    requiredMonthlySavingsCents,
    onTrack,
  };
}
