// SPDX-License-Identifier: BUSL-1.1

/**
 * HSA (Health Savings Account) planning engine.
 *
 * Projects HSA growth, calculates triple tax advantage savings, enforces
 * contribution limits, and considers Medicare eligibility at age 65.
 *
 * All monetary values are in integer cents. Rates use basis points.
 *
 * References: #1738
 */

import type { HsaPlanParams, HsaPlanResult, HsaProjectionPoint } from './types';

// ---------------------------------------------------------------------------
// 2024 HSA Contribution Limits
// ---------------------------------------------------------------------------

/** 2024 individual HSA contribution limit in cents. */
const INDIVIDUAL_LIMIT_CENTS = 415_000; // $4,150

/** 2024 family HSA contribution limit in cents. */
const FAMILY_LIMIT_CENTS = 830_000; // $8,300

/** HSA catch-up contribution for age 55+ in cents. */
const CATCH_UP_AMOUNT_CENTS = 100_000; // $1,000

/** Age at which catch-up contributions begin. */
const CATCH_UP_AGE = 55;

/** Medicare eligibility age. */
const MEDICARE_AGE = 65;

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
    return floored % 2 === 0 ? floored : floored + 1;
  }
  return Math.round(value);
}

/**
 * Convert basis points to a decimal rate.
 *
 * @param bps - Rate in basis points
 * @returns Decimal rate
 */
function bpsToDecimal(bps: number): number {
  return bps / 10000;
}

// ---------------------------------------------------------------------------
// Core calculations
// ---------------------------------------------------------------------------

/**
 * Get the HSA contribution limit for a coverage type and age.
 *
 * @param coverageType - 'individual' or 'family'
 * @param age - Current age in years
 * @returns Object with base limit, catch-up amount, and max contribution in cents
 */
export function getContributionLimits(
  coverageType: 'individual' | 'family',
  age: number,
): { limitCents: number; catchUpCents: number; maxCents: number } {
  const limitCents = coverageType === 'individual' ? INDIVIDUAL_LIMIT_CENTS : FAMILY_LIMIT_CENTS;
  const catchUpCents = age >= CATCH_UP_AGE ? CATCH_UP_AMOUNT_CENTS : 0;
  return {
    limitCents,
    catchUpCents,
    maxCents: limitCents + catchUpCents,
  };
}

/**
 * Calculate the triple tax advantage savings from HSA contributions.
 *
 * HSAs provide three tax benefits:
 * 1. Federal income tax deduction on contributions
 * 2. State income tax deduction on contributions (most states)
 * 3. FICA tax savings (if contributed via payroll deduction)
 *
 * @param annualContributionCents - Annual contribution in cents
 * @param federalTaxRateBps - Federal marginal tax rate in basis points
 * @param stateTaxRateBps - State marginal tax rate in basis points
 * @param ficaTaxRateBps - FICA tax rate in basis points
 * @returns Tax savings breakdown in cents
 */
export function calculateTripleTaxSavings(
  annualContributionCents: number,
  federalTaxRateBps: number,
  stateTaxRateBps: number,
  ficaTaxRateBps: number,
): {
  federalCents: number;
  stateCents: number;
  ficaCents: number;
  totalCents: number;
} {
  const federalCents = bankersRound(annualContributionCents * bpsToDecimal(federalTaxRateBps));
  const stateCents = bankersRound(annualContributionCents * bpsToDecimal(stateTaxRateBps));
  const ficaCents = bankersRound(annualContributionCents * bpsToDecimal(ficaTaxRateBps));

  return {
    federalCents,
    stateCents,
    ficaCents,
    totalCents: federalCents + stateCents + ficaCents,
  };
}

/**
 * Project HSA balance growth year-over-year until Medicare age.
 *
 * @param currentBalanceCents - Current HSA balance in cents
 * @param annualContributionCents - Annual contribution in cents
 * @param currentAge - Current age
 * @param annualReturnBps - Annual return in basis points (0 if not investing)
 * @param annualMedicalExpensesCents - Annual medical spending from HSA in cents
 * @param coverageType - Coverage type for limit enforcement
 * @returns Array of yearly projection points
 */
export function generateHsaProjection(
  currentBalanceCents: number,
  annualContributionCents: number,
  currentAge: number,
  annualReturnBps: number,
  annualMedicalExpensesCents: number,
  coverageType: 'individual' | 'family',
): HsaProjectionPoint[] {
  const annualReturn = bpsToDecimal(annualReturnBps);
  const points: HsaProjectionPoint[] = [];
  let balance = currentBalanceCents;
  let cumulativeContributions = 0;
  let cumulativeEarnings = 0;
  let cumulativeTaxSavings = 0;

  // We project to Medicare age at minimum, but always include at least 1 year
  const endAge = Math.max(currentAge + 1, MEDICARE_AGE);

  for (let age = currentAge; age <= endAge; age++) {
    points.push({
      age,
      balanceCents: bankersRound(balance),
      cumulativeContributionsCents: bankersRound(cumulativeContributions),
      cumulativeEarningsCents: bankersRound(cumulativeEarnings),
      cumulativeTaxSavingsCents: bankersRound(cumulativeTaxSavings),
    });

    // Can't contribute after Medicare age
    if (age < MEDICARE_AGE) {
      const limits = getContributionLimits(coverageType, age);
      const actualContribution = Math.min(annualContributionCents, limits.maxCents);
      cumulativeContributions += actualContribution;
      balance += actualContribution;

      // Approximate tax savings (using a simple combined rate estimate)
      // Actual savings calculated separately via calculateTripleTaxSavings
      cumulativeTaxSavings += bankersRound(actualContribution * 0.35); // ~35% combined estimate
    }

    // Medical expenses reduce balance
    balance = Math.max(0, balance - annualMedicalExpensesCents);

    // Investment growth
    const earnings = bankersRound(balance * annualReturn);
    balance += earnings;
    cumulativeEarnings += earnings;
  }

  return points;
}

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------

/**
 * Perform a complete HSA plan analysis.
 *
 * Calculates contribution limits, triple tax savings, and projects
 * balance growth until Medicare eligibility at age 65.
 *
 * @param params - HSA planning parameters
 * @returns Complete HSA plan analysis result
 */
export function analyzeHsaPlan(params: HsaPlanParams): HsaPlanResult {
  const limits = getContributionLimits(params.coverageType, params.currentAge);

  const exceedsLimit = params.annualContributionCents > limits.maxCents;

  const taxSavings = calculateTripleTaxSavings(
    Math.min(params.annualContributionCents, limits.maxCents),
    params.federalTaxRateBps,
    params.stateTaxRateBps,
    params.ficaTaxRateBps,
  );

  const yearsToMedicare = Math.max(0, MEDICARE_AGE - params.currentAge);

  const returnBps = params.investContributions ? params.annualReturnBps : 0;

  const projectionPoints = generateHsaProjection(
    params.currentBalanceCents,
    params.annualContributionCents,
    params.currentAge,
    returnBps,
    params.annualMedicalExpensesCents,
    params.coverageType,
  );

  // Balance at age 65 is the last point (or current if already 65+)
  const at65 = projectionPoints.find((p) => p.age === MEDICARE_AGE);
  const projectedBalanceAt65Cents = at65
    ? at65.balanceCents
    : projectionPoints[projectionPoints.length - 1].balanceCents;

  return {
    contributionLimitCents: limits.limitCents,
    catchUpAmountCents: limits.catchUpCents,
    maxContributionCents: limits.maxCents,
    exceedsLimit,
    annualTaxSavingsCents: taxSavings.totalCents,
    federalTaxSavingsCents: taxSavings.federalCents,
    stateTaxSavingsCents: taxSavings.stateCents,
    ficaTaxSavingsCents: taxSavings.ficaCents,
    projectedBalanceAt65Cents,
    yearsToMedicare,
    projectionPoints,
  };
}
