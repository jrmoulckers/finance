// SPDX-License-Identifier: BUSL-1.1

/**
 * Education funding planner (529 and tuition projection).
 *
 * Projects 529 plan growth, calculates tuition inflation, determines
 * contribution schedules, estimates tax benefits, and suggests
 * age-based asset allocation.
 *
 * All monetary values are in integer cents. Rates use basis points.
 *
 * References: #1738, #1763
 */

import type {
  AllocationSuggestion,
  EducationFundParams,
  EducationFundResult,
  EducationProjectionPoint,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default tuition inflation rate: 5% (500 bps). */
const DEFAULT_TUITION_INFLATION_BPS = 500;

/** Maximum annual 529 contribution for tax benefit consideration (per beneficiary). */
const MAX_529_ANNUAL_GIFT_CENTS = 1_800_000; // $18,000 (2024 gift tax exclusion)

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
 * Project the total cost of education adjusted for tuition inflation.
 *
 * @param currentAnnualTuitionCents - Today's annual tuition in cents
 * @param yearsUntilStart - Years until education begins
 * @param educationYears - Number of years of education
 * @param tuitionInflationBps - Annual tuition inflation in basis points
 * @returns Total projected cost of all education years, in cents
 */
export function projectTotalCost(
  currentAnnualTuitionCents: number,
  yearsUntilStart: number,
  educationYears: number,
  tuitionInflationBps: number = DEFAULT_TUITION_INFLATION_BPS,
): number {
  const inflationRate = bpsToDecimal(tuitionInflationBps);
  let totalCost = 0;

  for (let year = 0; year < educationYears; year++) {
    const futureYear = yearsUntilStart + year;
    totalCost += currentAnnualTuitionCents * Math.pow(1 + inflationRate, futureYear);
  }

  return bankersRound(totalCost);
}

/**
 * Project the 529 balance at a future date given monthly contributions.
 *
 * @param currentBalanceCents - Current 529 balance in cents
 * @param monthlyContributionCents - Monthly contribution in cents
 * @param years - Number of years to project
 * @param annualReturnBps - Annual investment return in basis points
 * @returns Projected balance in cents
 */
export function projectBalance(
  currentBalanceCents: number,
  monthlyContributionCents: number,
  years: number,
  annualReturnBps: number,
): number {
  if (years <= 0) return currentBalanceCents;
  const monthlyRate = bpsToDecimal(annualReturnBps) / 12;
  const months = Math.round(years * 12);
  let balance = currentBalanceCents;

  for (let m = 0; m < months; m++) {
    balance = balance * (1 + monthlyRate) + monthlyContributionCents;
  }

  return bankersRound(balance);
}

/**
 * Calculate the monthly contribution needed to fully fund education.
 *
 * @param targetCents - Total future cost in cents
 * @param currentBalanceCents - Current balance in cents
 * @param years - Years until education starts
 * @param annualReturnBps - Annual investment return in basis points
 * @returns Required monthly contribution in cents
 */
export function calculateRequiredContribution(
  targetCents: number,
  currentBalanceCents: number,
  years: number,
  annualReturnBps: number,
): number {
  if (years <= 0) {
    return Math.max(0, targetCents - currentBalanceCents);
  }

  const monthlyRate = bpsToDecimal(annualReturnBps) / 12;
  const months = Math.round(years * 12);

  // Future value of current balance
  const fvCurrent = currentBalanceCents * Math.pow(1 + monthlyRate, months);

  const gap = targetCents - fvCurrent;
  if (gap <= 0) return 0;

  // Future value of annuity factor
  if (monthlyRate === 0) {
    return bankersRound(gap / months);
  }

  const annuityFactor = (Math.pow(1 + monthlyRate, months) - 1) / monthlyRate;
  return bankersRound(gap / annuityFactor);
}

/**
 * Calculate annual state tax benefit from 529 contributions.
 *
 * @param annualContributionCents - Annual contribution in cents
 * @param stateTaxRateBps - State income tax rate in basis points
 * @returns Annual tax savings in cents
 */
export function calculateTaxBenefit(
  annualContributionCents: number,
  stateTaxRateBps: number,
): number {
  // Cap at gift tax exclusion for benefit calculation
  const eligibleCents = Math.min(annualContributionCents, MAX_529_ANNUAL_GIFT_CENTS);
  return bankersRound(eligibleCents * bpsToDecimal(stateTaxRateBps));
}

/**
 * Suggest an age-based asset allocation for a 529 plan.
 *
 * Follows a glide path: more equities when young, shifting to bonds/cash
 * as education start date approaches.
 *
 * @param yearsToEducation - Years until education begins
 * @returns Allocation suggestion with equity/bond/cash percentages
 */
export function suggestAllocation(yearsToEducation: number): AllocationSuggestion {
  if (yearsToEducation >= 15) {
    return {
      equityPercent: 90,
      bondPercent: 10,
      cashPercent: 0,
      description: 'Aggressive growth — mostly equities for long time horizon',
    };
  }
  if (yearsToEducation >= 10) {
    return {
      equityPercent: 70,
      bondPercent: 25,
      cashPercent: 5,
      description: 'Growth-oriented — balanced with some bonds',
    };
  }
  if (yearsToEducation >= 5) {
    return {
      equityPercent: 50,
      bondPercent: 40,
      cashPercent: 10,
      description: 'Moderate — shifting toward capital preservation',
    };
  }
  if (yearsToEducation >= 2) {
    return {
      equityPercent: 25,
      bondPercent: 50,
      cashPercent: 25,
      description: 'Conservative — protecting accumulated savings',
    };
  }
  return {
    equityPercent: 10,
    bondPercent: 30,
    cashPercent: 60,
    description: 'Capital preservation — education expenses imminent',
  };
}

/**
 * Generate year-by-year projection points.
 *
 * @param currentBalanceCents - Current balance in cents
 * @param monthlyContributionCents - Monthly contribution in cents
 * @param years - Years to project
 * @param annualReturnBps - Annual return in basis points
 * @returns Array of yearly projection points
 */
export function generateProjectionPoints(
  currentBalanceCents: number,
  monthlyContributionCents: number,
  years: number,
  annualReturnBps: number,
): EducationProjectionPoint[] {
  const monthlyRate = bpsToDecimal(annualReturnBps) / 12;
  const points: EducationProjectionPoint[] = [];
  let balance = currentBalanceCents;
  let totalContributions = 0;

  for (let year = 0; year <= years; year++) {
    const earnings = balance - currentBalanceCents - totalContributions;
    points.push({
      yearOffset: year,
      balanceCents: bankersRound(balance),
      totalContributionsCents: bankersRound(totalContributions),
      earningsCents: bankersRound(earnings),
    });

    // Simulate 12 months of contributions + growth
    for (let m = 0; m < 12; m++) {
      balance = balance * (1 + monthlyRate) + monthlyContributionCents;
      totalContributions += monthlyContributionCents;
    }
  }

  return points;
}

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------

/**
 * Perform a complete education funding analysis.
 *
 * Projects 529 balance growth, calculates funding gap, determines required
 * contributions, estimates tax benefits, and suggests asset allocation.
 *
 * @param params - Education fund parameters
 * @returns Complete education funding analysis result
 */
export function analyzeEducationFund(params: EducationFundParams): EducationFundResult {
  const yearsToStart = Math.max(0, params.educationStartAge - params.beneficiaryAge);

  const totalProjectedCostCents = projectTotalCost(
    params.currentAnnualTuitionCents,
    yearsToStart,
    params.educationYears,
    params.tuitionInflationBps,
  );

  const projectedBalanceCents = projectBalance(
    params.currentBalanceCents,
    params.monthlyContributionCents,
    yearsToStart,
    params.annualReturnBps,
  );

  const fundingGapCents = Math.max(0, totalProjectedCostCents - projectedBalanceCents);

  const coverageRatioBps =
    totalProjectedCostCents > 0
      ? bankersRound((projectedBalanceCents / totalProjectedCostCents) * 10000)
      : 10000;

  const requiredMonthlyContributionCents = calculateRequiredContribution(
    totalProjectedCostCents,
    params.currentBalanceCents,
    yearsToStart,
    params.annualReturnBps,
  );

  const annualContributionCents = params.monthlyContributionCents * 12;
  const annualTaxBenefitCents = calculateTaxBenefit(
    annualContributionCents,
    params.stateTaxRateBps,
  );

  const projectionPoints = generateProjectionPoints(
    params.currentBalanceCents,
    params.monthlyContributionCents,
    yearsToStart,
    params.annualReturnBps,
  );

  const suggestedAllocation = suggestAllocation(yearsToStart);

  return {
    totalProjectedCostCents,
    projectedBalanceCents,
    fundingGapCents,
    coverageRatioBps,
    requiredMonthlyContributionCents,
    projectionPoints,
    annualTaxBenefitCents,
    suggestedAllocation,
  };
}
