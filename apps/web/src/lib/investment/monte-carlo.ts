// SPDX-License-Identifier: BUSL-1.1

/**
 * Monte Carlo retirement planner and recession simulator.
 *
 * Runs N simulations with randomized annual returns drawn from a normal
 * distribution. Calculates success rates, percentile outcomes, and
 * supports recession scenario overlays.
 *
 * Uses a seeded Mulberry32 PRNG for deterministic, reproducible tests.
 * All monetary values are integer cents.
 *
 * References: issue #1726
 */

import { bankersRound } from './rebalancing';
import type {
  MonteCarloInput,
  MonteCarloPercentiles,
  MonteCarloRecessionResult,
  MonteCarloResult,
  MonteCarloRun,
  RecessionScenario,
  SeededRng,
} from './types';

// ---------------------------------------------------------------------------
// Seeded PRNG (Mulberry32)
// ---------------------------------------------------------------------------

/**
 * Create a seeded pseudo-random number generator using the Mulberry32 algorithm.
 *
 * Produces uniformly distributed values in [0, 1).
 *
 * @param seed - Integer seed for reproducibility.
 * @returns A function that returns the next pseudo-random number.
 */
export function createSeededRng(seed: number): SeededRng {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Box-Muller transform for normal distribution
// ---------------------------------------------------------------------------

/**
 * Generate a normally distributed random number using the Box-Muller transform.
 *
 * @param rng - Uniform random number generator [0, 1).
 * @param mean - Mean of the distribution.
 * @param stdDev - Standard deviation of the distribution.
 * @returns A normally distributed random number.
 */
export function normalRandom(rng: SeededRng, mean: number, stdDev: number): number {
  const u1 = rng();
  const u2 = rng();
  // Avoid log(0)
  const safeU1 = Math.max(u1, 1e-10);
  const z = Math.sqrt(-2 * Math.log(safeU1)) * Math.cos(2 * Math.PI * u2);
  return mean + stdDev * z;
}

// ---------------------------------------------------------------------------
// Single simulation run
// ---------------------------------------------------------------------------

/**
 * Run a single Monte Carlo simulation.
 *
 * Each year:
 * 1. Apply randomized return to portfolio.
 * 2. Subtract inflation-adjusted withdrawal.
 * 3. Check for depletion.
 *
 * @param input - Simulation parameters.
 * @param rng - Seeded random number generator.
 * @param recessionOverride - Optional recession scenario to override returns.
 * @returns Single simulation run result.
 */
function runSingleSimulation(
  input: MonteCarloInput,
  rng: SeededRng,
  recessionOverride?: RecessionScenario,
): MonteCarloRun {
  const yearEndValues: number[] = [];
  let portfolio = input.initialPortfolioCents;
  let withdrawal = input.annualWithdrawalCents;
  let depletionYear = -1;

  for (let year = 0; year < input.years; year++) {
    // Determine annual return
    let annualReturn: number;
    if (
      recessionOverride &&
      year >= recessionOverride.startYear &&
      year < recessionOverride.startYear + recessionOverride.durationYears
    ) {
      // Use recession return
      annualReturn = recessionOverride.recessionReturnPercent / 100;
    } else {
      annualReturn = normalRandom(
        rng,
        input.expectedReturnPercent / 100,
        input.returnStdDevPercent / 100,
      );
    }

    // Apply return
    portfolio = portfolio * (1 + annualReturn);

    // Subtract inflation-adjusted withdrawal
    portfolio -= withdrawal;
    withdrawal *= 1 + input.inflationRatePercent / 100;

    // Check depletion
    if (portfolio <= 0) {
      portfolio = 0;
      if (depletionYear === -1) {
        depletionYear = year;
      }
    }

    yearEndValues.push(bankersRound(portfolio));
  }

  return {
    yearEndValues,
    survived: depletionYear === -1,
    depletionYear,
  };
}

// ---------------------------------------------------------------------------
// Percentile computation
// ---------------------------------------------------------------------------

/**
 * Get a percentile value from a sorted array.
 *
 * @param sorted - Sorted array of numbers (ascending).
 * @param percentile - Percentile (0–100).
 * @returns The value at the given percentile.
 */
function getPercentile(sorted: readonly number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.floor((percentile / 100) * sorted.length)),
  );
  return sorted[index];
}

// ---------------------------------------------------------------------------
// Monte Carlo simulation
// ---------------------------------------------------------------------------

/**
 * Run a full Monte Carlo simulation with N runs.
 *
 * @param input - Simulation parameters.
 * @param seed - PRNG seed for reproducibility (default 42).
 * @param recessionOverride - Optional recession scenario.
 * @returns Aggregated Monte Carlo results.
 */
export function runMonteCarloSimulation(
  input: MonteCarloInput,
  seed: number = 42,
  recessionOverride?: RecessionScenario,
): MonteCarloResult {
  const rng = createSeededRng(seed);
  const runs: MonteCarloRun[] = [];

  for (let i = 0; i < input.simulations; i++) {
    runs.push(runSingleSimulation(input, rng, recessionOverride));
  }

  // Success rate
  const successCount = runs.filter((r) => r.survived).length;
  const successRate = Math.round((successCount / input.simulations) * 10000) / 100;

  // Final values for percentiles
  const finalValues = runs
    .map((r) => r.yearEndValues[r.yearEndValues.length - 1] ?? 0)
    .sort((a, b) => a - b);

  const percentiles: MonteCarloPercentiles = {
    p10: getPercentile(finalValues, 10),
    p25: getPercentile(finalValues, 25),
    p50: getPercentile(finalValues, 50),
    p75: getPercentile(finalValues, 75),
    p90: getPercentile(finalValues, 90),
  };

  // Average final value
  const totalFinal = finalValues.reduce((sum, v) => sum + v, 0);
  const averageFinalValueCents = bankersRound(totalFinal / input.simulations);

  // Year-by-year percentile paths
  const medianPath: number[] = [];
  const pessimisticPath: number[] = [];
  const optimisticPath: number[] = [];

  for (let year = 0; year < input.years; year++) {
    const yearValues = runs.map((r) => r.yearEndValues[year] ?? 0).sort((a, b) => a - b);

    medianPath.push(getPercentile(yearValues, 50));
    pessimisticPath.push(getPercentile(yearValues, 10));
    optimisticPath.push(getPercentile(yearValues, 90));
  }

  return {
    successRate,
    totalSimulations: input.simulations,
    percentiles,
    medianPath,
    pessimisticPath,
    optimisticPath,
    averageFinalValueCents,
  };
}

// ---------------------------------------------------------------------------
// Recession scenario
// ---------------------------------------------------------------------------

/** Default recession scenario: bear market in first 2 years. */
export const DEFAULT_RECESSION_SCENARIO: RecessionScenario = {
  startYear: 0,
  durationYears: 2,
  recessionReturnPercent: -20,
};

/** Severe recession: 3-year bear market starting at year 1. */
export const SEVERE_RECESSION_SCENARIO: RecessionScenario = {
  startYear: 1,
  durationYears: 3,
  recessionReturnPercent: -30,
};

/**
 * Run Monte Carlo simulation with and without a recession scenario.
 *
 * Compares baseline results against a recession-impacted scenario to
 * quantify sequence-of-returns risk.
 *
 * @param input - Simulation parameters.
 * @param scenario - Recession scenario (defaults to first-2-year bear market).
 * @param seed - PRNG seed (default 42).
 * @returns Combined base and recession results with impact analysis.
 */
export function runRecessionSimulation(
  input: MonteCarloInput,
  scenario: RecessionScenario = DEFAULT_RECESSION_SCENARIO,
  seed: number = 42,
): MonteCarloRecessionResult {
  const baseResult = runMonteCarloSimulation(input, seed);
  const recessionResult = runMonteCarloSimulation(input, seed, scenario);

  return {
    baseResult,
    recessionResult,
    successRateImpact:
      Math.round((baseResult.successRate - recessionResult.successRate) * 100) / 100,
    scenario,
  };
}
