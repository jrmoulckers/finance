// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for priority-based adaptive allocation engine.
 *
 * References: issue #1755
 */

import { describe, expect, it } from 'vitest';
import { AllocationPriority, type PrioritisedCategory } from './budgeting-types';
import {
  allocateByPriority,
  calculateRolloverBudget,
  predictIncome,
  runScenario,
} from './budgeting-adaptive';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cat(
  id: string,
  name: string,
  requestedCents: number,
  priority: AllocationPriority,
): PrioritisedCategory {
  return { categoryId: id, name, requestedCents, priority };
}

// ---------------------------------------------------------------------------
// allocateByPriority
// ---------------------------------------------------------------------------

describe('allocateByPriority', () => {
  it('returns zero-funded results for zero income', () => {
    const categories = [cat('1', 'Rent', 150_000, AllocationPriority.ESSENTIAL)];
    const result = allocateByPriority(0, categories);
    expect(result[0].fundedCents).toBe(0);
    expect(result[0].fullyFunded).toBe(false);
  });

  it('returns empty array for no categories', () => {
    const result = allocateByPriority(500_000, []);
    expect(result).toHaveLength(0);
  });

  it('fully funds all categories when income is sufficient', () => {
    const categories = [
      cat('1', 'Rent', 150_000, AllocationPriority.ESSENTIAL),
      cat('2', 'Food', 50_000, AllocationPriority.IMPORTANT),
      cat('3', 'Fun', 30_000, AllocationPriority.DISCRETIONARY),
    ];
    const result = allocateByPriority(500_000, categories);

    expect(result[0].fundedCents).toBe(150_000);
    expect(result[0].fullyFunded).toBe(true);
    expect(result[1].fundedCents).toBe(50_000);
    expect(result[1].fullyFunded).toBe(true);
    expect(result[2].fundedCents).toBe(30_000);
    expect(result[2].fullyFunded).toBe(true);
  });

  it('funds essentials first when income is limited', () => {
    const categories = [
      cat('1', 'Rent', 150_000, AllocationPriority.ESSENTIAL),
      cat('2', 'Fun', 50_000, AllocationPriority.DISCRETIONARY),
    ];
    const result = allocateByPriority(150_000, categories);

    expect(result.find((r) => r.categoryId === '1')?.fullyFunded).toBe(true);
    expect(result.find((r) => r.categoryId === '2')?.fundedCents).toBe(0);
  });

  it('distributes proportionally within a tier when underfunded', () => {
    const categories = [
      cat('1', 'Rent', 100_000, AllocationPriority.ESSENTIAL),
      cat('2', 'Utilities', 50_000, AllocationPriority.ESSENTIAL),
    ];
    // Only 75k available for 150k of essentials
    const result = allocateByPriority(75_000, categories);

    const rent = result.find((r) => r.categoryId === '1')!;
    const util = result.find((r) => r.categoryId === '2')!;

    // 100/150 * 75k = 50k, 50/150 * 75k = 25k
    expect(rent.fundedCents).toBe(50_000);
    expect(util.fundedCents).toBe(25_000);
    expect(rent.fundedCents + util.fundedCents).toBe(75_000);
  });

  it('respects priority overrides', () => {
    const categories = [cat('1', 'Rent', 100_000, AllocationPriority.DISCRETIONARY)];
    const overrides = new Map([['1', AllocationPriority.ESSENTIAL]]);
    const result = allocateByPriority(100_000, categories, overrides);

    expect(result[0].priority).toBe(AllocationPriority.ESSENTIAL);
    expect(result[0].fullyFunded).toBe(true);
  });

  it('handles categories with zero requested amount', () => {
    const categories = [cat('1', 'Empty', 0, AllocationPriority.ESSENTIAL)];
    const result = allocateByPriority(100_000, categories);
    expect(result[0].fundedCents).toBe(0);
    expect(result[0].fullyFunded).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// predictIncome
// ---------------------------------------------------------------------------

describe('predictIncome', () => {
  it('returns zero for empty history', () => {
    const result = predictIncome([]);
    expect(result.predictedCents).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.dataPoints).toBe(0);
  });

  it('returns the single value with low confidence', () => {
    const result = predictIncome([300_000]);
    expect(result.predictedCents).toBe(300_000);
    expect(result.confidence).toBe(0.3);
    expect(result.dataPoints).toBe(1);
  });

  it('weights recent data more heavily with default weights', () => {
    // history=[100k, 200k, 300k], weights=[1,2,3]
    // weighted = (100k*1 + 200k*2 + 300k*3) / 6 = 1_400_000/6 ≈ 233_333
    const result = predictIncome([100_000, 200_000, 300_000]);
    expect(result.predictedCents).toBe(233_333);
    expect(result.dataPoints).toBe(3);
  });

  it('uses custom weights when provided', () => {
    // Equal weights → simple average
    const result = predictIncome([100_000, 200_000, 300_000], [1, 1, 1]);
    expect(result.predictedCents).toBe(200_000);
  });

  it('increases confidence with more data points', () => {
    const short = predictIncome([100_000, 200_000]);
    const long = predictIncome([100_000, 200_000, 300_000, 400_000, 500_000]);
    expect(long.confidence).toBeGreaterThan(short.confidence);
  });

  it('caps confidence at 0.95', () => {
    const history = Array.from({ length: 20 }, () => 100_000);
    const result = predictIncome(history);
    expect(result.confidence).toBeLessThanOrEqual(0.95);
  });
});

// ---------------------------------------------------------------------------
// runScenario
// ---------------------------------------------------------------------------

describe('runScenario', () => {
  it('calculates surplus when income exceeds needs', () => {
    const categories = [cat('1', 'Rent', 100_000, AllocationPriority.ESSENTIAL)];
    const result = runScenario(200_000, categories);

    expect(result.incomeCents).toBe(200_000);
    expect(result.totalFundedCents).toBe(100_000);
    expect(result.surplusCents).toBe(100_000);
    expect(result.underfunded).toHaveLength(0);
  });

  it('identifies underfunded categories', () => {
    const categories = [
      cat('1', 'Rent', 100_000, AllocationPriority.ESSENTIAL),
      cat('2', 'Food', 50_000, AllocationPriority.IMPORTANT),
    ];
    const result = runScenario(100_000, categories);

    expect(result.underfunded).toHaveLength(1);
    expect(result.underfunded[0].categoryId).toBe('2');
    expect(result.surplusCents).toBe(0);
  });

  it('handles zero income scenario', () => {
    const categories = [cat('1', 'Rent', 100_000, AllocationPriority.ESSENTIAL)];
    const result = runScenario(0, categories);

    expect(result.totalFundedCents).toBe(0);
    expect(result.surplusCents).toBe(0);
    expect(result.underfunded).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// calculateRolloverBudget
// ---------------------------------------------------------------------------

describe('calculateRolloverBudget', () => {
  it('carries surplus forward', () => {
    const prior = [{ categoryId: '1', allocatedCents: 100_000, spentCents: 80_000 }];
    const newAllocs = new Map([['1', 100_000]]);
    const result = calculateRolloverBudget(prior, newAllocs);

    expect(result[0].unusedCents).toBe(20_000);
    expect(result[0].rolledOverCents).toBe(120_000);
  });

  it('does not carry deficit forward', () => {
    const prior = [{ categoryId: '1', allocatedCents: 100_000, spentCents: 120_000 }];
    const newAllocs = new Map([['1', 100_000]]);
    const result = calculateRolloverBudget(prior, newAllocs);

    expect(result[0].unusedCents).toBe(0);
    expect(result[0].rolledOverCents).toBe(100_000);
  });

  it('handles exact spending (no surplus)', () => {
    const prior = [{ categoryId: '1', allocatedCents: 50_000, spentCents: 50_000 }];
    const newAllocs = new Map([['1', 50_000]]);
    const result = calculateRolloverBudget(prior, newAllocs);

    expect(result[0].unusedCents).toBe(0);
    expect(result[0].rolledOverCents).toBe(50_000);
  });

  it('defaults new allocation to 0 when category is missing', () => {
    const prior = [{ categoryId: '1', allocatedCents: 100_000, spentCents: 60_000 }];
    const result = calculateRolloverBudget(prior, new Map());

    expect(result[0].rolledOverCents).toBe(40_000); // 0 + 40k surplus
  });

  it('handles multiple categories', () => {
    const prior = [
      { categoryId: '1', allocatedCents: 100_000, spentCents: 90_000 },
      { categoryId: '2', allocatedCents: 50_000, spentCents: 60_000 },
    ];
    const newAllocs = new Map([
      ['1', 100_000],
      ['2', 50_000],
    ]);
    const result = calculateRolloverBudget(prior, newAllocs);

    expect(result[0].unusedCents).toBe(10_000);
    expect(result[0].rolledOverCents).toBe(110_000);
    expect(result[1].unusedCents).toBe(0); // overspent → no rollover
    expect(result[1].rolledOverCents).toBe(50_000);
  });
});
