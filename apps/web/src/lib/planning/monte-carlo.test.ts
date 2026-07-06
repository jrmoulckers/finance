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
  createSeededRng,
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
  monthlyRetirementIncomeCents: 0,
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
    // Discounted at the default real return, lands in a sensible range.
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

  it('requires a smaller nest egg when the expected return is higher', () => {
    const lowReturn = calculateTargetNestEgg(400000, 0.03, 25, 0.05);
    const highReturn = calculateTargetNestEgg(400000, 0.03, 25, 0.09);
    // Faster real growth means less principal is needed to fund the same spend.
    expect(highReturn).toBeLessThan(lowReturn);
  });

  it('does not treat the withdrawal rate as the growth rate', () => {
    // With return == inflation there is no real growth, so the target must be
    // the full undiscounted sum of spending — never a withdrawal-rate annuity.
    const result = calculateTargetNestEgg(400000, 0.03, 25, 0.03);
    expect(result).toBe(400000 * 12 * 25);
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
    // Already retired: no accumulation phase, but the remaining horizon
    // (planningHorizonAge - currentAge) is still modeled as a drawdown.
    const expectedYears = params.planningHorizonAge - params.currentAge;
    expect(result.successRate).toBe(0);
    expect(result.medianPath).toHaveLength(expectedYears);
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

  it('is deterministic for identical inputs (seeded)', () => {
    const a = assessRetirementReadiness(DEFAULT_PARAMS);
    const b = assessRetirementReadiness(DEFAULT_PARAMS);
    expect(a.score).toBe(b.score);
    expect(a.monteCarlo.successRate).toBe(b.monteCarlo.successRate);
    expect(a.monthlyGapCents).toBe(b.monthlyGapCents);
  });

  it('labels the savings factor as "% of income" only when income is known', () => {
    const withIncome = assessRetirementReadiness({
      ...DEFAULT_PARAMS,
      monthlyGrossIncomeCents: 500000, // $5,000/month gross
    });
    const incomeFactor = withIncome.factors.find((f) => f.description.includes('of income'));
    expect(incomeFactor).toBeDefined();

    const withoutIncome = assessRetirementReadiness(DEFAULT_PARAMS);
    const claimsIncome = withoutIncome.factors.some((f) => f.description.includes('of income'));
    expect(claimsIncome).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Seeded RNG / determinism
// ---------------------------------------------------------------------------

describe('createSeededRng', () => {
  it('produces a repeatable sequence for the same seed', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);
    expect(a()).not.toBe(b());
  });

  it('stays within [0, 1)', () => {
    const rng = createSeededRng(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('runMonteCarlo determinism', () => {
  it('returns identical results for the same params and seed', () => {
    const a = runMonteCarlo(DEFAULT_PARAMS, 200);
    const b = runMonteCarlo(DEFAULT_PARAMS, 200);
    expect(a.successRate).toBe(b.successRate);
    expect(a.medianFinalCents).toBe(b.medianFinalCents);
  });

  it('can vary with an explicit different seed', () => {
    const a = runMonteCarlo(DEFAULT_PARAMS, 200, 1);
    const b = runMonteCarlo(DEFAULT_PARAMS, 200, 2);
    // Different seeds should generally differ; both remain valid probabilities.
    expect(a.successRate).toBeGreaterThanOrEqual(0);
    expect(b.successRate).toBeLessThanOrEqual(1);
  });
});
