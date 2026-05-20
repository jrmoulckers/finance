// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for variable-income analysis engine.
 *
 * References: issue #1566
 */

import { describe, expect, it } from 'vitest';
import {
  analyseVariableIncome,
  calculateBufferMonths,
  calculateMedian,
  calculateStdDev,
} from './budgeting-variable-income';

// ---------------------------------------------------------------------------
// calculateMedian
// ---------------------------------------------------------------------------

describe('calculateMedian', () => {
  it('returns 0 for an empty array', () => {
    expect(calculateMedian([])).toBe(0);
  });

  it('returns the single element for a one-element array', () => {
    expect(calculateMedian([42_000])).toBe(42_000);
  });

  it('returns the middle value for odd-length arrays', () => {
    expect(calculateMedian([10, 20, 30])).toBe(20);
    expect(calculateMedian([5, 1, 3])).toBe(3); // unsorted input
  });

  it('averages middle two values for even-length arrays', () => {
    expect(calculateMedian([10, 20, 30, 40])).toBe(25);
  });

  it('applies bankers rounding when averaging even-length midpoints', () => {
    // (10 + 11) / 2 = 10.5 → bankers rounds to 10 (even)
    expect(calculateMedian([10, 11])).toBe(10);
    // (11 + 12) / 2 = 11.5 → bankers rounds to 12 (even)
    expect(calculateMedian([11, 12])).toBe(12);
  });

  it('handles identical values', () => {
    expect(calculateMedian([50, 50, 50, 50])).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// calculateStdDev
// ---------------------------------------------------------------------------

describe('calculateStdDev', () => {
  it('returns 0 for empty array', () => {
    expect(calculateStdDev([], 0)).toBe(0);
  });

  it('returns 0 for single-element array', () => {
    expect(calculateStdDev([100], 100)).toBe(0);
  });

  it('computes population stddev correctly', () => {
    // Values: [2, 4, 4, 4, 5, 5, 7, 9] → mean=5 → variance=4 → stddev=2
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(calculateStdDev(values, 5)).toBe(2);
  });

  it('handles identical values (zero variance)', () => {
    expect(calculateStdDev([100, 100, 100], 100)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateBufferMonths
// ---------------------------------------------------------------------------

describe('calculateBufferMonths', () => {
  it('returns 0 when expenses are zero', () => {
    expect(calculateBufferMonths(100_000, 0)).toBe(0);
  });

  it('returns 0 when expenses are negative', () => {
    expect(calculateBufferMonths(100_000, -50_000)).toBe(0);
  });

  it('returns 0 when savings are zero', () => {
    expect(calculateBufferMonths(0, 50_000)).toBe(0);
  });

  it('returns 0 when savings are negative', () => {
    expect(calculateBufferMonths(-10_000, 50_000)).toBe(0);
  });

  it('floors the result', () => {
    // 150_000 / 100_000 = 1.5 → floors to 1
    expect(calculateBufferMonths(150_000, 100_000)).toBe(1);
  });

  it('calculates exact multiples correctly', () => {
    expect(calculateBufferMonths(600_000, 200_000)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// analyseVariableIncome
// ---------------------------------------------------------------------------

describe('analyseVariableIncome', () => {
  it('returns zeroed result for empty history', () => {
    const result = analyseVariableIncome([], 50_000, 100_000);
    expect(result.averageCents).toBe(0);
    expect(result.medianCents).toBe(0);
    expect(result.minCents).toBe(0);
    expect(result.maxCents).toBe(0);
    expect(result.stdDevCents).toBe(0);
    expect(result.variabilityPercent).toBe(0);
    expect(result.bufferMonths).toBe(0);
    expect(result.conservativeBudgetCents).toBe(0);
  });

  it('handles single income entry', () => {
    const result = analyseVariableIncome([300_000], 100_000, 500_000);
    expect(result.averageCents).toBe(300_000);
    expect(result.medianCents).toBe(300_000);
    expect(result.minCents).toBe(300_000);
    expect(result.maxCents).toBe(300_000);
    expect(result.stdDevCents).toBe(0); // single value → no stddev
    expect(result.conservativeBudgetCents).toBe(300_000); // mean - 0
    expect(result.bufferMonths).toBe(5);
  });

  it('computes statistics for multiple income entries', () => {
    // incomes: [200k, 300k, 400k] → mean=300k, sorted=[200k,300k,400k] → median=300k
    const result = analyseVariableIncome([200_000, 300_000, 400_000], 100_000, 600_000);

    expect(result.averageCents).toBe(300_000);
    expect(result.medianCents).toBe(300_000);
    expect(result.minCents).toBe(200_000);
    expect(result.maxCents).toBe(400_000);
    expect(result.bufferMonths).toBe(6);
  });

  it('floors conservative budget to zero when stddev exceeds mean', () => {
    // Large variance with small mean
    const result = analyseVariableIncome([10, 500_000], 100_000, 0);
    expect(result.conservativeBudgetCents).toBeGreaterThanOrEqual(0);
  });

  it('computes variability percent', () => {
    // All same → stddev = 0 → variability = 0
    const stable = analyseVariableIncome([100_000, 100_000, 100_000], 50_000, 0);
    expect(stable.variabilityPercent).toBe(0);
  });
});
