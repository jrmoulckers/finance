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
 * Default seed for Monte Carlo simulations. A fixed seed makes readiness
 * scores and contribution-gap recommendations reproducible: identical inputs
 * always yield identical results, so the number no longer wanders on every
 * unrelated re-render or parameter tweak.
 */
export const DEFAULT_MONTE_CARLO_SEED = 0x9e3779b9;

/**
 * Create a deterministic pseudo-random generator (mulberry32).
 *
 * @param seed - 32-bit unsigned seed
 * @returns A function returning uniform floats in [0, 1)
 */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a normally distributed random number using Box-Muller transform.
 *
 * @param mean - Mean of the distribution
 * @param stdDev - Standard deviation of the distribution
 * @param rng - Uniform [0,1) source (defaults to Math.random for ad-hoc use)
 * @returns A random sample from the normal distribution
 */
export function normalRandom(
  mean: number,
  stdDev: number,
  rng: () => number = Math.random,
): number {
  const u1 = rng();
  const u2 = rng();
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
 * Models the portfolio as the present value of an inflation-growing spending
 * stream, discounted at the **real return** (expected return net of
 * inflation). This is horizon-aware and, for long early-retirement horizons at
 * ~4% real return, converges to the familiar 25x / 4%-rule target.
 *
 * NOTE: earlier versions discounted at the *withdrawal rate*, which is not a
 * growth rate — that conflated the safe-withdrawal assumption with portfolio
 * returns and produced targets that diverged from the 25x rule. The discount
 * rate is now derived from `annualReturnRate` and `inflationRate`.
 *
 * @param monthlySpendingCents - Desired monthly spending in today's cents
 * @param inflationRate - Annual inflation rate (e.g. 0.03)
 * @param retirementYears - Number of years in retirement
 * @param annualReturnRate - Expected nominal annual return (e.g. 0.07)
 * @returns Required nest egg in cents
 */
export function calculateTargetNestEgg(
  monthlySpendingCents: number,
  inflationRate: number,
  retirementYears: number,
  annualReturnRate: number = 0.07,
): number {
  const annualSpending = monthlySpendingCents * 12;
  // Real return: portfolio growth net of inflation. This — not the withdrawal
  // rate — is the correct discount rate for the retirement spending annuity.
  const realReturn = (1 + annualReturnRate) / (1 + inflationRate) - 1;

  if (realReturn <= 0) {
    // No real growth: the portfolio must hold the full undiscounted spend.
    return Math.round(annualSpending * retirementYears);
  }

  // PV of a growing annuity, expressed in real terms: payment * (1 - (1+r)^-n) / r
  const pvFactor = (1 - Math.pow(1 + realReturn, -retirementYears)) / realReturn;
  return Math.round(annualSpending * pvFactor);
}

/** Calculate retirement spending that must be funded from savings after income. */
export function calculateNetRetirementSpending(
  monthlySpendingCents: number,
  monthlyRetirementIncomeCents: number,
): number {
  return Math.max(0, monthlySpendingCents - monthlyRetirementIncomeCents);
}

// ---------------------------------------------------------------------------
// Monte Carlo simulation
// ---------------------------------------------------------------------------

/**
 * Run a Monte Carlo simulation for retirement planning.
 *
 * Each iteration models year-by-year portfolio growth using normally
 * distributed random returns, with withdrawals in retirement years. A fixed
 * default seed makes results reproducible for identical inputs.
 *
 * @param params - Retirement planning parameters
 * @param iterations - Number of simulation iterations (default 1000)
 * @param seed - PRNG seed for reproducibility (default {@link DEFAULT_MONTE_CARLO_SEED})
 * @returns Aggregated Monte Carlo results
 */
export function runMonteCarlo(
  params: RetirementParams,
  iterations: number = DEFAULT_ITERATIONS,
  seed: number = DEFAULT_MONTE_CARLO_SEED,
): MonteCarloResult {
  const rng = createSeededRng(seed);
  const yearsToRetirement = Math.max(0, params.retirementAge - params.currentAge);
  const totalYears = params.planningHorizonAge - params.currentAge;
  const retirementYears = totalYears - yearsToRetirement;
  const netMonthlySpendingCents = calculateNetRetirementSpending(
    params.desiredMonthlySpendingCents,
    params.monthlyRetirementIncomeCents,
  );

  if (totalYears <= 0 || retirementYears < 0) {
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
      const annualReturn = normalRandom(params.annualReturnRate, params.annualReturnStdDev, rng);

      if (year < yearsToRetirement) {
        // Accumulation phase: grow + contribute
        balance = balance * (1 + annualReturn) + params.monthlyContributionCents * 12;
      } else {
        // Withdrawal phase: grow - spend (inflation-adjusted)
        const yearsInRetirement = year - yearsToRetirement;
        const inflatedSpending =
          netMonthlySpendingCents *
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
  const yearsToRetirement = Math.max(0, params.retirementAge - params.currentAge);
  const netMonthlyRetirementNeedCents = calculateNetRetirementSpending(
    params.desiredMonthlySpendingCents,
    params.monthlyRetirementIncomeCents,
  );
  // A true savings rate is contribution / gross income. When income is known
  // we report that; otherwise we fall back to a contribution-coverage ratio
  // (how much of the combined monthly retirement commitment the contribution
  // funds) and are careful NOT to call it a "percent of income".
  const grossIncomeCents = params.monthlyGrossIncomeCents ?? 0;
  const hasIncome = grossIncomeCents > 0;
  const savingsRate = hasIncome ? params.monthlyContributionCents / grossIncomeCents : 0;
  const contributionCoverage =
    params.monthlyContributionCents > 0
      ? params.monthlyContributionCents /
        (params.monthlyContributionCents + netMonthlyRetirementNeedCents)
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
      description: `Projected savings cover ${Math.round(fundingRatio * 100)}% of your target. Small adjustments can close the gap.`,
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
      description: `${yearsToRetirement} years to retirement. Consistent saving is important.`,
    });
  } else {
    factors.push({
      label: 'Short time horizon',
      impact: 'negative',
      description: `Only ${yearsToRetirement} years to retirement limits growth potential.`,
    });
  }

  // Savings rate factor. Only claim a "percent of income" when gross income
  // is actually known; otherwise describe the contribution-coverage ratio.
  if (hasIncome) {
    const pct = Math.round(savingsRate * 100);
    if (savingsRate >= 0.2) {
      factors.push({
        label: 'Strong savings rate',
        impact: 'positive',
        description: `Saving ${pct}% of income is above the recommended 15%.`,
      });
    } else if (savingsRate >= 0.1) {
      factors.push({
        label: 'Adequate savings rate',
        impact: 'neutral',
        description: `Saving ${pct}% of income. Consider increasing to 15-20%.`,
      });
    } else {
      factors.push({
        label: 'Low savings rate',
        impact: 'negative',
        description: `Saving only ${pct}% of income. Aim for at least 15%.`,
      });
    }
  } else {
    const pct = Math.round(contributionCoverage * 100);
    if (contributionCoverage >= 0.5) {
      factors.push({
        label: 'Strong contribution level',
        impact: 'positive',
        description: `Your contribution funds ${pct}% of your combined monthly retirement commitment.`,
      });
    } else if (contributionCoverage >= 0.25) {
      factors.push({
        label: 'Moderate contribution level',
        impact: 'neutral',
        description: `Your contribution funds ${pct}% of your combined monthly retirement commitment. Consider increasing it.`,
      });
    } else {
      factors.push({
        label: 'Low contribution level',
        impact: 'negative',
        description: `Your contribution funds only ${pct}% of your combined monthly retirement commitment.`,
      });
    }
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
  let high =
    Math.max(
      params.desiredMonthlySpendingCents,
      calculateNetRetirementSpending(
        params.desiredMonthlySpendingCents,
        params.monthlyRetirementIncomeCents,
      ),
    ) * 2; // Upper bound: 2x desired spending

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
  const yearsToRetirement = Math.max(0, params.retirementAge - params.currentAge);
  const retirementYears = Math.max(
    0,
    params.planningHorizonAge - Math.max(params.currentAge, params.retirementAge),
  );

  // Deterministic projections
  const projectedSavingsCents = projectSavings(
    params.currentSavingsCents,
    params.monthlyContributionCents,
    params.annualReturnRate,
    yearsToRetirement,
  );

  const targetNestEggCents = calculateTargetNestEgg(
    calculateNetRetirementSpending(
      params.desiredMonthlySpendingCents,
      params.monthlyRetirementIncomeCents,
    ),
    params.annualInflationRate,
    retirementYears,
    params.annualReturnRate,
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
