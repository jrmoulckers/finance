// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the Monte Carlo retirement planner and recession simulator.
 *
 * Uses seeded PRNG for deterministic, reproducible tests.
 *
 * References: issue #1726
 */

import { describe, expect, it } from 'vitest';
import type { MonteCarloInput } from './types';
import {
  DEFAULT_RECESSION_SCENARIO,
  createSeededRng,
  normalRandom,
  runMonteCarloSimulation,
  runRecessionSimulation,
} from './monte-carlo';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseInput: MonteCarloInput = {
  initialPortfolioCents: 1000000_00, // $1M
  annualWithdrawalCents: 40000_00, // $40k (4% rule)
  expectedReturnPercent: 7,
  returnStdDevPercent: 12,
  years: 30,
  simulations: 100, // Reduced for test speed
  inflationRatePercent: 3,
};

// ---------------------------------------------------------------------------
// createSeededRng
// ---------------------------------------------------------------------------

describe('createSeededRng', () => {
  it('produces deterministic sequence from same seed', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);

    const values1 = Array.from({ length: 10 }, () => rng1());
    const values2 = Array.from({ length: 10 }, () => rng2());

    expect(values1).toEqual(values2);
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(99);

    const values1 = Array.from({ length: 10 }, () => rng1());
    const values2 = Array.from({ length: 10 }, () => rng2());

    expect(values1).not.toEqual(values2);
  });

  it('produces values in [0, 1)', () => {
    const rng = createSeededRng(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

// ---------------------------------------------------------------------------
// normalRandom
// ---------------------------------------------------------------------------

describe('normalRandom', () => {
  it('produces values centered around the mean', () => {
    const rng = createSeededRng(42);
    const values = Array.from({ length: 10000 }, () => normalRandom(rng, 7, 12));
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    // Should be within ~0.5 of the expected mean
    expect(Math.abs(mean - 7)).toBeLessThan(0.5);
  });

  it('has approximately correct standard deviation', () => {
    const rng = createSeededRng(42);
    const values = Array.from({ length: 10000 }, () => normalRandom(rng, 0, 12));
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);
    // Should be within ~1 of expected stdDev=12
    expect(Math.abs(stdDev - 12)).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// runMonteCarloSimulation
// ---------------------------------------------------------------------------

describe('runMonteCarloSimulation', () => {
  it('is deterministic with same seed', () => {
    const result1 = runMonteCarloSimulation(baseInput, 42);
    const result2 = runMonteCarloSimulation(baseInput, 42);

    expect(result1.successRate).toBe(result2.successRate);
    expect(result1.percentiles).toEqual(result2.percentiles);
    expect(result1.medianPath).toEqual(result2.medianPath);
  });

  it('produces different results with different seeds', () => {
    const result1 = runMonteCarloSimulation(baseInput, 42);
    const result2 = runMonteCarloSimulation(baseInput, 99);

    // Different seeds should produce different (though possibly similar) results
    expect(result1.averageFinalValueCents).not.toBe(result2.averageFinalValueCents);
  });

  it('returns correct simulation count', () => {
    const result = runMonteCarloSimulation(baseInput, 42);
    expect(result.totalSimulations).toBe(100);
  });

  it('success rate is between 0 and 100', () => {
    const result = runMonteCarloSimulation(baseInput, 42);
    expect(result.successRate).toBeGreaterThanOrEqual(0);
    expect(result.successRate).toBeLessThanOrEqual(100);
  });

  it('percentiles are in ascending order', () => {
    const result = runMonteCarloSimulation(baseInput, 42);
    expect(result.percentiles.p10).toBeLessThanOrEqual(result.percentiles.p25);
    expect(result.percentiles.p25).toBeLessThanOrEqual(result.percentiles.p50);
    expect(result.percentiles.p50).toBeLessThanOrEqual(result.percentiles.p75);
    expect(result.percentiles.p75).toBeLessThanOrEqual(result.percentiles.p90);
  });

  it('median path has correct length', () => {
    const result = runMonteCarloSimulation(baseInput, 42);
    expect(result.medianPath).toHaveLength(30);
    expect(result.pessimisticPath).toHaveLength(30);
    expect(result.optimisticPath).toHaveLength(30);
  });

  it('optimistic path >= median >= pessimistic at each year', () => {
    const result = runMonteCarloSimulation(baseInput, 42);
    for (let i = 0; i < 30; i++) {
      expect(result.optimisticPath[i]).toBeGreaterThanOrEqual(result.medianPath[i]);
      expect(result.medianPath[i]).toBeGreaterThanOrEqual(result.pessimisticPath[i]);
    }
  });

  it('high withdrawal rate reduces success rate', () => {
    const conservative = runMonteCarloSimulation(
      { ...baseInput, annualWithdrawalCents: 30000_00 },
      42,
    );
    const aggressive = runMonteCarloSimulation(
      { ...baseInput, annualWithdrawalCents: 80000_00 },
      42,
    );
    expect(conservative.successRate).toBeGreaterThanOrEqual(aggressive.successRate);
  });

  it('handles zero-year simulation', () => {
    const result = runMonteCarloSimulation({ ...baseInput, years: 0 }, 42);
    expect(result.medianPath).toHaveLength(0);
    // All simulations "survive" a 0-year period
    expect(result.successRate).toBe(100);
  });

  it('handles single simulation', () => {
    const result = runMonteCarloSimulation({ ...baseInput, simulations: 1 }, 42);
    expect(result.totalSimulations).toBe(1);
    expect(result.successRate === 0 || result.successRate === 100).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runRecessionSimulation
// ---------------------------------------------------------------------------

describe('runRecessionSimulation', () => {
  it('returns both base and recession results', () => {
    const result = runRecessionSimulation(baseInput, DEFAULT_RECESSION_SCENARIO, 42);

    expect(result.baseResult).toBeDefined();
    expect(result.recessionResult).toBeDefined();
    expect(result.scenario).toEqual(DEFAULT_RECESSION_SCENARIO);
  });

  it('recession generally reduces success rate', () => {
    const result = runRecessionSimulation(baseInput, DEFAULT_RECESSION_SCENARIO, 42);
    // Recession should reduce success rate or keep it the same
    expect(result.successRateImpact).toBeGreaterThanOrEqual(0);
  });

  it('success rate impact equals difference', () => {
    const result = runRecessionSimulation(baseInput, DEFAULT_RECESSION_SCENARIO, 42);
    const expectedImpact =
      Math.round((result.baseResult.successRate - result.recessionResult.successRate) * 100) / 100;
    expect(result.successRateImpact).toBeCloseTo(expectedImpact, 2);
  });

  it('severe recession has more impact', () => {
    const mild = runRecessionSimulation(
      baseInput,
      { startYear: 0, durationYears: 1, recessionReturnPercent: -10 },
      42,
    );
    const severe = runRecessionSimulation(
      baseInput,
      { startYear: 0, durationYears: 3, recessionReturnPercent: -30 },
      42,
    );
    expect(severe.successRateImpact).toBeGreaterThanOrEqual(mild.successRateImpact);
  });

  it('is deterministic with same seed', () => {
    const result1 = runRecessionSimulation(baseInput, DEFAULT_RECESSION_SCENARIO, 42);
    const result2 = runRecessionSimulation(baseInput, DEFAULT_RECESSION_SCENARIO, 42);
    expect(result1.successRateImpact).toBe(result2.successRateImpact);
    expect(result1.baseResult.successRate).toBe(result2.baseResult.successRate);
  });
});
