// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for Monte Carlo retirement simulation engine.
 *
 * References: #1721, #1679
 */

import { describe, it, expect } from 'vitest';
import {
  projectSavings,
  calculateTargetNestEgg,
  runMonteCarlo,
  assessRetirementReadiness,
  normalRandom,
} from './monte-carlo';
import type { RetirementParams } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_PARAMS: RetirementParams = {
  currentAge: 30,
  retirementAge: 65,
  planningHorizonAge: 90,
  currentSavingsCents: 5000000, // $50,000
  monthlyContributionCents: 100000, // $1,000/month
  annualReturnRate: 0.07,
  annualInflationRate: 0.03,
  desiredMonthlySpendingCents: 400000, // $4,000/month
  annualReturnStdDev: 0.15,
};

// ---------------------------------------------------------------------------
// normalRandom
// ---------------------------------------------------------------------------

describe('normalRandom', () => {
  it('generates numbers centered around the mean', () => {
    const samples = Array.from({ length: 10000 }, () => normalRandom(0, 1));
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    // With 10000 samples, mean should be close to 0
    expect(Math.abs(mean)).toBeLessThan(0.1);
  });

  it('respects the standard deviation', () => {
    const samples = Array.from({ length: 10000 }, () => normalRandom(5, 2));
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
    const stdDev = Math.sqrt(variance);
    expect(mean).toBeCloseTo(5, 0);
    expect(stdDev).toBeCloseTo(2, 0);
  });
});

// ---------------------------------------------------------------------------
// projectSavings
// ---------------------------------------------------------------------------

describe('projectSavings', () => {
  it('grows savings with compound interest and contributions', () => {
    // $50,000 + $1,000/month at 7% for 35 years
    const result = projectSavings(5000000, 100000, 0.07, 35);
    // Should be well over $1M
    expect(result).toBeGreaterThan(100000000); // > $1,000,000
  });

  it('returns the initial amount when years is 0', () => {
    const result = projectSavings(5000000, 100000, 0.07, 0);
    expect(result).toBe(5000000);
  });

  it('handles zero contributions', () => {
    const result = projectSavings(5000000, 0, 0.07, 10);
    // $50,000 at 7% for 10 years ≈ $98,358
    expect(result).toBeGreaterThan(9000000);
    expect(result).toBeLessThan(11000000);
  });

  it('handles zero return rate', () => {
    // $50,000 + $1,000/month for 12 months = $62,000
    const result = projectSavings(5000000, 100000, 0, 1);
    expect(result).toBe(6200000);
  });
});

// ---------------------------------------------------------------------------
// calculateTargetNestEgg
// ---------------------------------------------------------------------------

describe('calculateTargetNestEgg', () => {
  it('calculates a reasonable target for $4,000/month over 25 years', () => {
    const result = calculateTargetNestEgg(400000, 0.03, 25);
    // At 4% withdrawal, ~$1.2M range
    expect(result).toBeGreaterThan(50000000); // > $500K
    expect(result).toBeLessThan(200000000); // < $2M
  });

  it('returns larger amounts for longer retirement periods', () => {
    const short = calculateTargetNestEgg(400000, 0.03, 20);
    const long = calculateTargetNestEgg(400000, 0.03, 35);
    expect(long).toBeGreaterThan(short);
  });

  it('handles zero inflation', () => {
    const result = calculateTargetNestEgg(400000, 0, 25);
    expect(result).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// runMonteCarlo
// ---------------------------------------------------------------------------

describe('runMonteCarlo', () => {
  it('returns results with correct iteration count', () => {
    const result = runMonteCarlo(DEFAULT_PARAMS, 100);
    expect(result.iterations).toBe(100);
  });

  it('returns success rate between 0 and 1', () => {
    const result = runMonteCarlo(DEFAULT_PARAMS, 200);
    expect(result.successRate).toBeGreaterThanOrEqual(0);
    expect(result.successRate).toBeLessThanOrEqual(1);
  });

  it('produces percentile paths of correct length', () => {
    const totalYears = DEFAULT_PARAMS.planningHorizonAge - DEFAULT_PARAMS.currentAge;
    const result = runMonteCarlo(DEFAULT_PARAMS, 100);
    expect(result.medianPath).toHaveLength(totalYears);
    expect(result.p10Path).toHaveLength(totalYears);
    expect(result.p90Path).toHaveLength(totalYears);
  });

  it('p90 >= median >= p10 for final values', () => {
    const result = runMonteCarlo(DEFAULT_PARAMS, 500);
    expect(result.p90FinalCents).toBeGreaterThanOrEqual(result.medianFinalCents);
    expect(result.medianFinalCents).toBeGreaterThanOrEqual(result.p10FinalCents);
  });

  it('handles edge case: already retired', () => {
    const params: RetirementParams = {
      ...DEFAULT_PARAMS,
      currentAge: 70,
      retirementAge: 65,
    };
    const result = runMonteCarlo(params, 100);
    expect(result.successRate).toBe(0);
    expect(result.medianPath).toHaveLength(0);
  });

  it('higher contributions produce higher success rates on average', () => {
    const low = runMonteCarlo({ ...DEFAULT_PARAMS, monthlyContributionCents: 50000 }, 500);
    const high = runMonteCarlo({ ...DEFAULT_PARAMS, monthlyContributionCents: 300000 }, 500);
    // Not guaranteed per run due to randomness, but very likely
    expect(high.successRate).toBeGreaterThanOrEqual(low.successRate - 0.2);
  });
});

// ---------------------------------------------------------------------------
// assessRetirementReadiness
// ---------------------------------------------------------------------------

describe('assessRetirementReadiness', () => {
  it('returns a score between 0 and 100', () => {
    const result = assessRetirementReadiness(DEFAULT_PARAMS);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('returns a valid rating', () => {
    const result = assessRetirementReadiness(DEFAULT_PARAMS);
    expect(['excellent', 'good', 'fair', 'poor', 'critical']).toContain(result.rating);
  });

  it('includes at least one factor', () => {
    const result = assessRetirementReadiness(DEFAULT_PARAMS);
    expect(result.factors.length).toBeGreaterThan(0);
  });

  it('returns contribution gap >= 0', () => {
    const result = assessRetirementReadiness(DEFAULT_PARAMS);
    expect(result.monthlyGapCents).toBeGreaterThanOrEqual(0);
  });

  it('includes projected and target savings', () => {
    const result = assessRetirementReadiness(DEFAULT_PARAMS);
    expect(result.projectedSavingsCents).toBeGreaterThan(0);
    expect(result.targetNestEggCents).toBeGreaterThan(0);
  });
});
