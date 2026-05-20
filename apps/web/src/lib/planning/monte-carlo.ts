// SPDX-License-Identifier: BUSL-1.1

/**
 * Monte Carlo retirement simulation engine.
 *
 * Runs probabilistic simulations to estimate retirement success rates.
 * Uses Box-Muller transform for normal distribution sampling to model
 * annual return variability.
 *
 * All monetary values are in cents (integers).
 *
 * References: #1721, #1679
 */

import type {
  MonteCarloResult,
  RetirementFactor,
  RetirementParams,
  RetirementReadiness,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default number of Monte Carlo iterations. */
const DEFAULT_ITERATIONS = 1000;

/** Score thresholds for retirement readiness rating. */
const SCORE_THRESHOLDS = {
  excellent: 90,
  good: 70,
  fair: 50,
  poor: 30,
} as const;

// ---------------------------------------------------------------------------
// Random number generation (Box-Muller transform)
// ---------------------------------------------------------------------------

/**
 * Generate a normally distributed random number using Box-Muller transform.
 *
 * @param mean - Mean of the distribution
 * @param stdDev - Standard deviation of the distribution
 * @returns A random sample from the normal distribution
 */
export function normalRandom(mean: number, stdDev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  // Box-Muller: Z = sqrt(-2 * ln(u1)) * cos(2π * u2)
  const z = Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
  return mean + stdDev * z;
}

// ---------------------------------------------------------------------------
// Deterministic projection
// ---------------------------------------------------------------------------

/**
 * Calculate the deterministic future value of retirement savings.
 *
 * Uses compound interest with monthly contributions. Returns value in cents.
 *
 * @param currentCents - Current savings balance in cents
 * @param monthlyContributionCents - Monthly contribution in cents
 * @param annualRate - Expected annual return (e.g. 0.07)
 * @param years - Number of years to project
 * @returns Projected savings in cents
 */
export function projectSavings(
  currentCents: number,
  monthlyContributionCents: number,
  annualRate: number,
  years: number,
): number {
  const monthlyRate = annualRate / 12;
  const months = Math.round(years * 12);
  let balance = currentCents;

  for (let m = 0; m < months; m++) {
    balance = balance * (1 + monthlyRate) + monthlyContributionCents;
  }

  return Math.round(balance);
}

/**
 * Calculate the nest egg needed to sustain desired spending through retirement.
 *
 * Uses the 4% rule variant adjusted for inflation and planning horizon.
 *
 * @param monthlySpendingCents - Desired monthly spending in today's cents
 * @param inflationRate - Annual inflation rate
 * @param retirementYears - Number of years in retirement
 * @param withdrawalRate - Safe withdrawal rate (default 0.04)
 * @returns Required nest egg in cents
 */
export function calculateTargetNestEgg(
  monthlySpendingCents: number,
  inflationRate: number,
  retirementYears: number,
  withdrawalRate: number = 0.04,
): number {
  // Inflate monthly spending to retirement-start dollars
  const annualSpending = monthlySpendingCents * 12;
  // Present value of annuity for retirement years, adjusted for inflation
  const realRate = (1 + withdrawalRate) / (1 + inflationRate) - 1;

  if (realRate <= 0) {
    // When inflation exceeds withdrawal rate, use simple multiplication
    return Math.round(annualSpending * retirementYears);
  }

  // PV of annuity: payment * (1 - (1+r)^-n) / r
  const pvFactor = (1 - Math.pow(1 + realRate, -retirementYears)) / realRate;
  return Math.round(annualSpending * pvFactor);
}

// ---------------------------------------------------------------------------
// Monte Carlo simulation
// ---------------------------------------------------------------------------

/**
 * Run a Monte Carlo simulation for retirement planning.
 *
 * Each iteration models year-by-year portfolio growth using normally
 * distributed random returns, with withdrawals in retirement years.
 *
 * @param params - Retirement planning parameters
 * @param iterations - Number of simulation iterations (default 1000)
 * @returns Aggregated Monte Carlo results
 */
export function runMonteCarlo(
  params: RetirementParams,
  iterations: number = DEFAULT_ITERATIONS,
): MonteCarloResult {
  const yearsToRetirement = params.retirementAge - params.currentAge;
  const retirementYears = params.planningHorizonAge - params.retirementAge;
  const totalYears = yearsToRetirement + retirementYears;

  if (totalYears <= 0 || yearsToRetirement < 0) {
    return {
      iterations,
      successRate: 0,
      medianFinalCents: 0,
      p10FinalCents: 0,
      p90FinalCents: 0,
      medianPath: [],
      p10Path: [],
      p90Path: [],
    };
  }

  // Collect all iteration paths
  const allPaths: number[][] = [];
  let successes = 0;

  for (let i = 0; i < iterations; i++) {
    const path: number[] = [];
    let balance = params.currentSavingsCents;
    let succeeded = true;

    for (let year = 0; year < totalYears; year++) {
      const annualReturn = normalRandom(params.annualReturnRate, params.annualReturnStdDev);

      if (year < yearsToRetirement) {
        // Accumulation phase: grow + contribute
        balance = balance * (1 + annualReturn) + params.monthlyContributionCents * 12;
      } else {
        // Withdrawal phase: grow - spend (inflation-adjusted)
        const yearsInRetirement = year - yearsToRetirement;
        const inflatedSpending =
          params.desiredMonthlySpendingCents *
          12 *
          Math.pow(1 + params.annualInflationRate, yearsInRetirement);
        balance = balance * (1 + annualReturn) - inflatedSpending;
      }

      if (balance < 0) {
        balance = 0;
        succeeded = false;
      }

      path.push(Math.round(balance));
    }

    if (succeeded && balance > 0) {
      successes++;
    }

    allPaths.push(path);
  }

  // Compute percentile paths
  const medianPath: number[] = [];
  const p10Path: number[] = [];
  const p90Path: number[] = [];

  for (let year = 0; year < totalYears; year++) {
    const values = allPaths.map((p) => p[year]).sort((a, b) => a - b);
    p10Path.push(values[Math.floor(iterations * 0.1)] ?? 0);
    medianPath.push(values[Math.floor(iterations * 0.5)] ?? 0);
    p90Path.push(values[Math.floor(iterations * 0.9)] ?? 0);
  }

  const finals = allPaths.map((p) => p[totalYears - 1] ?? 0).sort((a, b) => a - b);

  return {
    iterations,
    successRate: successes / iterations,
    medianFinalCents: finals[Math.floor(iterations * 0.5)] ?? 0,
    p10FinalCents: finals[Math.floor(iterations * 0.1)] ?? 0,
    p90FinalCents: finals[Math.floor(iterations * 0.9)] ?? 0,
    medianPath,
    p10Path,
    p90Path,
  };
}

// ---------------------------------------------------------------------------
// Retirement readiness scoring
// ---------------------------------------------------------------------------

/**
 * Assess key factors affecting retirement readiness.
 *
 * @param params - Retirement parameters
 * @param projectedCents - Deterministic projected savings at retirement
 * @param targetCents - Target nest egg amount
 * @returns Array of scored factors
 */
function assessFactors(
  params: RetirementParams,
  projectedCents: number,
  targetCents: number,
): RetirementFactor[] {
  const factors: RetirementFactor[] = [];
  const fundingRatio = targetCents > 0 ? projectedCents / targetCents : 0;
  const yearsToRetirement = params.retirementAge - params.currentAge;
  const savingsRate =
    params.monthlyContributionCents > 0
      ? params.monthlyContributionCents /
        (params.monthlyContributionCents + params.desiredMonthlySpendingCents)
      : 0;

  // Funding ratio factor
  if (fundingRatio >= 1.0) {
    factors.push({
      label: 'Savings on track',
      impact: 'positive',
      description: `Projected savings cover ${Math.round(fundingRatio * 100)}% of your target.`,
    });
  } else if (fundingRatio >= 0.7) {
    factors.push({
      label: 'Close to target',
      impact: 'neutral',
      description: `Projected savings cover ${Math.round(fundingRatio * 100)}% of your target — small adjustments can close the gap.`,
    });
  } else {
    factors.push({
      label: 'Savings shortfall',
      impact: 'negative',
      description: `Projected savings only cover ${Math.round(fundingRatio * 100)}% of your target.`,
    });
  }

  // Time horizon factor
  if (yearsToRetirement >= 20) {
    factors.push({
      label: 'Long time horizon',
      impact: 'positive',
      description: `${yearsToRetirement} years to retirement gives compound growth time to work.`,
    });
  } else if (yearsToRetirement >= 10) {
    factors.push({
      label: 'Moderate time horizon',
      impact: 'neutral',
      description: `${yearsToRetirement} years to retirement — consistent saving is important.`,
    });
  } else {
    factors.push({
      label: 'Short time horizon',
      impact: 'negative',
      description: `Only ${yearsToRetirement} years to retirement limits growth potential.`,
    });
  }

  // Savings rate factor
  if (savingsRate >= 0.2) {
    factors.push({
      label: 'Strong savings rate',
      impact: 'positive',
      description: `Saving ${Math.round(savingsRate * 100)}% of income is above the recommended 15%.`,
    });
  } else if (savingsRate >= 0.1) {
    factors.push({
      label: 'Adequate savings rate',
      impact: 'neutral',
      description: `Saving ${Math.round(savingsRate * 100)}% of income — consider increasing to 15-20%.`,
    });
  } else {
    factors.push({
      label: 'Low savings rate',
      impact: 'negative',
      description: `Saving only ${Math.round(savingsRate * 100)}% of income — aim for at least 15%.`,
    });
  }

  return factors;
}

/**
 * Calculate the additional monthly contribution needed to reach a target
 * success rate in Monte Carlo simulation.
 *
 * Uses binary search to find the contribution gap.
 *
 * @param params - Current retirement parameters
 * @param targetSuccessRate - Target success rate (default 0.8 = 80%)
 * @param maxIterations - Max binary search steps (default 15)
 * @returns Additional monthly contribution needed in cents
 */
export function calculateContributionGap(
  params: RetirementParams,
  targetSuccessRate: number = 0.8,
  maxIterations: number = 15,
): number {
  // Quick check: are we already above the target?
  const baseline = runMonteCarlo(params, 500);
  if (baseline.successRate >= targetSuccessRate) {
    return 0;
  }

  // Binary search for the additional contribution needed
  let low = 0;
  let high = params.desiredMonthlySpendingCents * 2; // Upper bound: 2x desired spending

  for (let i = 0; i < maxIterations; i++) {
    const mid = Math.round((low + high) / 2);
    const testParams: RetirementParams = {
      ...params,
      monthlyContributionCents: params.monthlyContributionCents + mid,
    };
    const result = runMonteCarlo(testParams, 500);

    if (result.successRate >= targetSuccessRate) {
      high = mid;
    } else {
      low = mid;
    }

    if (high - low <= 100) {
      // Within $1 precision
      break;
    }
  }

  return high;
}

/**
 * Compute a comprehensive retirement readiness assessment.
 *
 * Combines deterministic projection, Monte Carlo simulation, contribution
 * gap analysis, and factor assessment into a single result.
 *
 * @param params - Retirement planning parameters
 * @returns Complete retirement readiness assessment
 */
export function assessRetirementReadiness(params: RetirementParams): RetirementReadiness {
  const yearsToRetirement = params.retirementAge - params.currentAge;
  const retirementYears = params.planningHorizonAge - params.retirementAge;

  // Deterministic projections
  const projectedSavingsCents = projectSavings(
    params.currentSavingsCents,
    params.monthlyContributionCents,
    params.annualReturnRate,
    yearsToRetirement,
  );

  const targetNestEggCents = calculateTargetNestEgg(
    params.desiredMonthlySpendingCents,
    params.annualInflationRate,
    retirementYears,
  );

  // Monte Carlo
  const monteCarlo = runMonteCarlo(params);

  // Contribution gap
  const monthlyGapCents = calculateContributionGap(params);

  // Score: weighted combination of success rate, funding ratio, and savings rate
  const fundingRatio = targetNestEggCents > 0 ? projectedSavingsCents / targetNestEggCents : 0;
  const clampedFunding = Math.min(fundingRatio, 1.5);
  const rawScore = monteCarlo.successRate * 60 + Math.min(clampedFunding, 1) * 30 + 10;
  const score = Math.round(Math.max(0, Math.min(100, rawScore)));

  // Rating
  let rating: RetirementReadiness['rating'];
  if (score >= SCORE_THRESHOLDS.excellent) rating = 'excellent';
  else if (score >= SCORE_THRESHOLDS.good) rating = 'good';
  else if (score >= SCORE_THRESHOLDS.fair) rating = 'fair';
  else if (score >= SCORE_THRESHOLDS.poor) rating = 'poor';
  else rating = 'critical';

  // Factors
  const factors = assessFactors(params, projectedSavingsCents, targetNestEggCents);

  return {
    score,
    rating,
    monthlyGapCents,
    monteCarlo,
    projectedSavingsCents,
    targetNestEggCents,
    factors,
  };
}
