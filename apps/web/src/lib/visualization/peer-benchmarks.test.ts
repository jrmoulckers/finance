// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for anonymous peer spending benchmarks engine.
 *
 * References: issue #1670
 */

import { describe, it, expect } from 'vitest';
import {
  BLS_CATEGORIES,
  LIFE_STAGES,
  getBenchmarkPercent,
  getLifeStageDefinition,
  estimatePercentile,
  aggregateByBenchmarkCategory,
  generateBenchmarkReport,
} from './peer-benchmarks';
import type { UserSpending } from './peer-benchmarks';
import type { CategoryMapping } from './types';

// ---------------------------------------------------------------------------
// BLS reference data
// ---------------------------------------------------------------------------

describe('BLS_CATEGORIES', () => {
  it('has 10 categories', () => {
    expect(BLS_CATEGORIES).toHaveLength(10);
  });

  it('sums to 100%', () => {
    const sum = BLS_CATEGORIES.reduce((s, c) => s + c.nationalAveragePercent, 0);
    expect(sum).toBe(100);
  });

  it('housing is the largest category', () => {
    const sorted = [...BLS_CATEGORIES].sort(
      (a, b) => b.nationalAveragePercent - a.nationalAveragePercent,
    );
    expect(sorted[0].key).toBe('housing');
  });
});

describe('LIFE_STAGES', () => {
  it('has 6 life stages', () => {
    expect(LIFE_STAGES).toHaveLength(6);
  });

  it('each stage adjustments sum to ~100%', () => {
    for (const stage of LIFE_STAGES) {
      const sum = Object.values(stage.adjustments).reduce((s, v) => s + v, 0);
      expect(sum).toBeCloseTo(100, 0);
    }
  });
});

// ---------------------------------------------------------------------------
// getBenchmarkPercent
// ---------------------------------------------------------------------------

describe('getBenchmarkPercent', () => {
  it('returns life-stage adjusted percent when available', () => {
    const result = getBenchmarkPercent('housing', 'single_young_professional');
    expect(result).toBe(35.0); // adjusted
  });

  it('falls back to national average for unknown category', () => {
    const result = getBenchmarkPercent('nonexistent', 'retiree');
    expect(result).toBe(0);
  });

  it('returns national average for healthcare at national level', () => {
    // "retiree" has healthcare at 14%
    expect(getBenchmarkPercent('healthcare', 'retiree')).toBe(14.0);
  });
});

// ---------------------------------------------------------------------------
// getLifeStageDefinition
// ---------------------------------------------------------------------------

describe('getLifeStageDefinition', () => {
  it('returns definition for valid stage', () => {
    const result = getLifeStageDefinition('couple_no_kids');
    expect(result).toBeDefined();
    expect(result?.label).toBe('Couple, No Kids');
  });

  it('returns undefined for invalid stage', () => {
    const result = getLifeStageDefinition('nonexistent' as never);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// estimatePercentile
// ---------------------------------------------------------------------------

describe('estimatePercentile', () => {
  it('returns 50 for spending at benchmark', () => {
    expect(estimatePercentile(33, 33)).toBe(50);
  });

  it('returns above 50 for spending above benchmark', () => {
    expect(estimatePercentile(45, 33)).toBeGreaterThan(50);
  });

  it('returns below 50 for spending below benchmark', () => {
    expect(estimatePercentile(20, 33)).toBeLessThan(50);
  });

  it('clamps to 1-99 range', () => {
    expect(estimatePercentile(100, 5)).toBeLessThanOrEqual(99);
    expect(estimatePercentile(0, 50)).toBeGreaterThanOrEqual(1);
  });

  it('returns 50 when benchmark is zero', () => {
    expect(estimatePercentile(10, 0)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// aggregateByBenchmarkCategory
// ---------------------------------------------------------------------------

describe('aggregateByBenchmarkCategory', () => {
  it('maps user categories to benchmark keys', () => {
    const spending: UserSpending[] = [
      { categoryId: 'cat-rent', amountCents: 150000 },
      { categoryId: 'cat-mortgage', amountCents: 50000 },
      { categoryId: 'cat-groceries', amountCents: 40000 },
    ];
    const mappings: CategoryMapping[] = [
      { categoryId: 'cat-rent', benchmarkKey: 'housing' },
      { categoryId: 'cat-mortgage', benchmarkKey: 'housing' },
      { categoryId: 'cat-groceries', benchmarkKey: 'food' },
    ];

    const result = aggregateByBenchmarkCategory(spending, mappings);
    expect(result.get('housing')).toBe(200000);
    expect(result.get('food')).toBe(40000);
  });

  it('falls back to miscellaneous for unmapped categories', () => {
    const spending: UserSpending[] = [{ categoryId: 'unknown', amountCents: 5000 }];
    const result = aggregateByBenchmarkCategory(spending, []);
    expect(result.get('miscellaneous')).toBe(5000);
  });

  it('returns empty map for no spending', () => {
    const result = aggregateByBenchmarkCategory([], []);
    expect(result.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// generateBenchmarkReport
// ---------------------------------------------------------------------------

describe('generateBenchmarkReport', () => {
  const spending: UserSpending[] = [
    { categoryId: 'rent', amountCents: 200000 },
    { categoryId: 'gas', amountCents: 30000 },
    { categoryId: 'groceries', amountCents: 60000 },
    { categoryId: 'dining', amountCents: 40000 },
    { categoryId: 'gym', amountCents: 5000 },
    { categoryId: 'netflix', amountCents: 2000 },
  ];

  const mappings: CategoryMapping[] = [
    { categoryId: 'rent', benchmarkKey: 'housing' },
    { categoryId: 'gas', benchmarkKey: 'transportation' },
    { categoryId: 'groceries', benchmarkKey: 'food' },
    { categoryId: 'dining', benchmarkKey: 'food' },
    { categoryId: 'gym', benchmarkKey: 'entertainment' },
    { categoryId: 'netflix', benchmarkKey: 'entertainment' },
  ];

  it('generates a complete report', () => {
    const report = generateBenchmarkReport(spending, mappings, 'single_young_professional');

    expect(report.lifeStage).toBe('single_young_professional');
    expect(report.comparisons).toHaveLength(10); // All BLS categories
    expect(report.totalSpendingCents).toBe(337000);
  });

  it('identifies over-spending categories', () => {
    const report = generateBenchmarkReport(spending, mappings, 'single_young_professional');
    // Housing is 200000/337000 ≈ 59.3% vs 35% benchmark → over
    expect(report.overSpending.length).toBeGreaterThan(0);
    expect(report.overSpending.find((c) => c.categoryKey === 'housing')).toBeDefined();
  });

  it('identifies under-spending categories', () => {
    const report = generateBenchmarkReport(spending, mappings, 'single_young_professional');
    // Transportation is 30000/337000 ≈ 8.9% vs 15% → under
    expect(report.underSpending.length).toBeGreaterThan(0);
  });

  it('each comparison has valid fields', () => {
    const report = generateBenchmarkReport(spending, mappings, 'couple_no_kids');

    for (const comp of report.comparisons) {
      expect(comp.categoryKey).toBeTruthy();
      expect(comp.categoryLabel).toBeTruthy();
      expect(comp.benchmarkPercent).toBeGreaterThanOrEqual(0);
      expect(comp.actualPercent).toBeGreaterThanOrEqual(0);
      expect(comp.estimatedPercentile).toBeGreaterThanOrEqual(1);
      expect(comp.estimatedPercentile).toBeLessThanOrEqual(99);
      expect(Number.isInteger(comp.benchmarkAmountCents)).toBe(true);
    }
  });

  it('handles empty spending', () => {
    const report = generateBenchmarkReport([], [], 'retiree');
    expect(report.totalSpendingCents).toBe(0);
    expect(report.comparisons.every((c) => c.actualPercent === 0)).toBe(true);
  });

  it('sorts over/under spending by deviation', () => {
    const report = generateBenchmarkReport(spending, mappings, 'family_young_kids');

    for (let i = 1; i < report.overSpending.length; i++) {
      expect(report.overSpending[i - 1].differencePercent).toBeGreaterThanOrEqual(
        report.overSpending[i].differencePercent,
      );
    }

    for (let i = 1; i < report.underSpending.length; i++) {
      expect(report.underSpending[i - 1].differencePercent).toBeLessThanOrEqual(
        report.underSpending[i].differencePercent,
      );
    }
  });
});
