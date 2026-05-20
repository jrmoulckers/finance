// SPDX-License-Identifier: BUSL-1.1

/**
 * Job loss financial runway calculator.
 *
 * Computes months of financial runway from liquid savings, severance,
 * unemployment benefits, and other income. Generates month-by-month
 * projections and actionable recommendations.
 *
 * All monetary values are in integer cents.
 *
 * References: #1767
 */

import type {
  JobLossRunwayParams,
  JobLossRunwayResult,
  RunwayProjectionPoint,
  RunwayRecommendation,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Runway thresholds (months) for recommendation tiers. */
const CRITICAL_MONTHS = 2;
const LOW_MONTHS = 3;
const MODERATE_MONTHS = 6;

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

// ---------------------------------------------------------------------------
// Core calculations
// ---------------------------------------------------------------------------

/**
 * Calculate the monthly burn rate for essential expenses including COBRA.
 *
 * @param monthlyEssentialCents - Monthly essential expenses in cents
 * @param cobraMonthlyPremiumCents - Monthly COBRA premium in cents
 * @returns Monthly essential burn rate in cents
 */
export function calculateEssentialBurnRate(
  monthlyEssentialCents: number,
  cobraMonthlyPremiumCents: number,
): number {
  return monthlyEssentialCents + cobraMonthlyPremiumCents;
}

/**
 * Calculate the full monthly burn rate (essential + non-essential + COBRA).
 *
 * @param monthlyEssentialCents - Monthly essential expenses in cents
 * @param monthlyNonEssentialCents - Monthly non-essential expenses in cents
 * @param cobraMonthlyPremiumCents - Monthly COBRA premium in cents
 * @returns Monthly full burn rate in cents
 */
export function calculateFullBurnRate(
  monthlyEssentialCents: number,
  monthlyNonEssentialCents: number,
  cobraMonthlyPremiumCents: number,
): number {
  return monthlyEssentialCents + monthlyNonEssentialCents + cobraMonthlyPremiumCents;
}

/**
 * Calculate income for a specific month from all sources.
 *
 * @param month - Month index (0 = month of job loss)
 * @param params - Job loss parameters
 * @returns Total income for that month in cents
 */
export function calculateMonthlyIncome(month: number, params: JobLossRunwayParams): number {
  let income = params.otherMonthlyIncomeCents;

  // Severance runs for a fixed number of months from month 0
  if (month < params.severanceMonths) {
    income += params.severanceMonthlyPayCents;
  }

  // Unemployment typically starts after severance ends (simplified model)
  const unemploymentStart = params.severanceMonths;
  const unemploymentEnd = unemploymentStart + params.unemploymentMaxMonths;
  if (month >= unemploymentStart && month < unemploymentEnd) {
    income += params.unemploymentBenefitCents;
  }

  return income;
}

/**
 * Generate a month-by-month runway projection.
 *
 * Projects savings depletion accounting for severance, unemployment
 * benefits, other income, and essential-only expenses.
 *
 * @param params - Job loss parameters
 * @param useEssentialOnly - Whether to use essential-only spending
 * @returns Array of monthly projection points
 */
export function generateMonthlyProjection(
  params: JobLossRunwayParams,
  useEssentialOnly: boolean = true,
): RunwayProjectionPoint[] {
  const expensesCents = useEssentialOnly
    ? calculateEssentialBurnRate(
        params.monthlyEssentialExpensesCents,
        params.cobraMonthlyPremiumCents,
      )
    : calculateFullBurnRate(
        params.monthlyEssentialExpensesCents,
        params.monthlyNonEssentialExpensesCents,
        params.cobraMonthlyPremiumCents,
      );

  const points: RunwayProjectionPoint[] = [];
  let remaining = params.liquidSavingsCents;

  // Project up to 36 months or until savings depleted
  const maxMonths = 36;

  for (let month = 0; month <= maxMonths; month++) {
    const incomeCents = calculateMonthlyIncome(month, params);
    const severanceActive = month < params.severanceMonths;
    const unemploymentStart = params.severanceMonths;
    const unemploymentEnd = unemploymentStart + params.unemploymentMaxMonths;
    const unemploymentActive = month >= unemploymentStart && month < unemploymentEnd;

    points.push({
      month,
      remainingSavingsCents: bankersRound(remaining),
      incomeCents,
      expensesCents,
      severanceActive,
      unemploymentActive,
    });

    if (remaining <= 0 && month > 0) break;

    // Net flow for the month
    remaining = remaining + incomeCents - expensesCents;
    if (remaining < 0) remaining = 0;
  }

  return points;
}

/**
 * Calculate months of runway given savings, income, and burn rate.
 *
 * Accounts for time-limited income sources (severance, unemployment).
 *
 * @param params - Job loss parameters
 * @param useEssentialOnly - Whether to use essential-only spending
 * @returns Number of months of runway (fractional)
 */
export function calculateRunwayMonths(
  params: JobLossRunwayParams,
  useEssentialOnly: boolean,
): number {
  const projection = generateMonthlyProjection(params, useEssentialOnly);

  // Find the first month where savings hit 0
  for (let i = 1; i < projection.length; i++) {
    if (projection[i].remainingSavingsCents <= 0) {
      // Interpolate for fractional month
      const prevRemaining = projection[i - 1].remainingSavingsCents;
      const netBurn = projection[i - 1].expensesCents - projection[i - 1].incomeCents;
      if (netBurn > 0) {
        return i - 1 + prevRemaining / netBurn;
      }
      return i;
    }
  }

  // Savings never depleted within projection window
  return projection.length - 1;
}

/**
 * Generate recommendations based on runway analysis.
 *
 * @param essentialRunwayMonths - Months of runway at essential spending
 * @param fullRunwayMonths - Months of runway at full spending
 * @param params - Job loss parameters
 * @returns Array of prioritized recommendations
 */
export function generateRecommendations(
  essentialRunwayMonths: number,
  fullRunwayMonths: number,
  params: JobLossRunwayParams,
): RunwayRecommendation[] {
  const recommendations: RunwayRecommendation[] = [];

  if (essentialRunwayMonths < CRITICAL_MONTHS) {
    recommendations.push({
      priority: 'critical',
      label: 'Emergency: Very low runway',
      description:
        'Less than 2 months of essential expenses covered. Seek immediate income sources and consider emergency assistance programs.',
    });
  }

  if (fullRunwayMonths < MODERATE_MONTHS && params.monthlyNonEssentialExpensesCents > 0) {
    recommendations.push({
      priority: 'high',
      label: 'Cut non-essential spending',
      description: `Reducing non-essential expenses extends runway by approximately ${bankersRound(essentialRunwayMonths - fullRunwayMonths)} months.`,
    });
  }

  if (params.cobraMonthlyPremiumCents > 0) {
    const cobraIncrease = params.cobraMonthlyPremiumCents - params.previousHealthPremiumCents;
    if (cobraIncrease > 0) {
      recommendations.push({
        priority: 'high',
        label: 'Evaluate health insurance alternatives',
        description:
          'COBRA is typically expensive. Consider ACA marketplace plans which may offer subsidies based on reduced income.',
      });
    }
  }

  if (params.unemploymentBenefitCents === 0 && essentialRunwayMonths < MODERATE_MONTHS) {
    recommendations.push({
      priority: 'high',
      label: 'Apply for unemployment benefits',
      description:
        'File for unemployment benefits immediately — most states have a waiting period before payments begin.',
    });
  }

  if (essentialRunwayMonths >= LOW_MONTHS && essentialRunwayMonths < MODERATE_MONTHS) {
    recommendations.push({
      priority: 'medium',
      label: 'Build additional runway',
      description:
        'Consider liquidating non-essential assets or taking on temporary/freelance work to extend your runway to 6+ months.',
    });
  }

  if (essentialRunwayMonths >= MODERATE_MONTHS) {
    recommendations.push({
      priority: 'low',
      label: 'Runway is adequate',
      description:
        'You have 6+ months of runway. Focus on job search while maintaining essential spending discipline.',
    });
  }

  return recommendations;
}

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------

/**
 * Perform a complete job loss runway analysis.
 *
 * Calculates burn rates, runway duration at different spending levels,
 * generates month-by-month projections, and provides recommendations.
 *
 * @param params - Job loss runway parameters
 * @returns Complete runway analysis result
 */
export function analyzeJobLossRunway(params: JobLossRunwayParams): JobLossRunwayResult {
  const essentialBurnRateCents = calculateEssentialBurnRate(
    params.monthlyEssentialExpensesCents,
    params.cobraMonthlyPremiumCents,
  );

  const fullBurnRateCents = calculateFullBurnRate(
    params.monthlyEssentialExpensesCents,
    params.monthlyNonEssentialExpensesCents,
    params.cobraMonthlyPremiumCents,
  );

  // Calculate total income from all time-limited sources
  const totalSeveranceIncome = params.severanceMonthlyPayCents * params.severanceMonths;
  const totalUnemploymentIncome = params.unemploymentBenefitCents * params.unemploymentMaxMonths;
  const totalIncomeOverRunwayCents = totalSeveranceIncome + totalUnemploymentIncome;

  // Average monthly income for net burn calculation
  // Use first-month income as representative for the simple net burn metric
  const firstMonthIncome = calculateMonthlyIncome(0, params);
  const netEssentialBurnCents = Math.max(0, essentialBurnRateCents - firstMonthIncome);
  const netFullBurnCents = Math.max(0, fullBurnRateCents - firstMonthIncome);

  const essentialRunwayMonths = calculateRunwayMonths(params, true);
  const fullRunwayMonths = calculateRunwayMonths(params, false);

  const cobraCostIncreaseCents = Math.max(
    0,
    params.cobraMonthlyPremiumCents - params.previousHealthPremiumCents,
  );

  const monthlyProjection = generateMonthlyProjection(params, true);

  const recommendations = generateRecommendations(essentialRunwayMonths, fullRunwayMonths, params);

  return {
    essentialBurnRateCents,
    fullBurnRateCents,
    netEssentialBurnCents,
    netFullBurnCents,
    essentialRunwayMonths: bankersRound(essentialRunwayMonths),
    fullRunwayMonths: bankersRound(fullRunwayMonths),
    cobraCostIncreaseCents,
    totalIncomeOverRunwayCents,
    monthlyProjection,
    recommendations,
  };
}
