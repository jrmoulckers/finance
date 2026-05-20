// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the manual asset registry engine.
 *
 * Covers current value lookup, value change tracking, portfolio
 * contribution, category breakdown, and filtering.
 *
 * References: issue #1581
 */

import { describe, expect, it } from 'vitest';
import type { ManualAsset } from './types';
import {
  buildPortfolioSummary,
  calculatePortfolioContribution,
  calculateTotalValue,
  filterByCategory,
  getCurrentValue,
  getSortedValueHistory,
  getValueChange,
  getValueChangePercent,
} from './manual-assets';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const houseAsset: ManualAsset = {
  id: 'a1',
  name: 'Vacation Home',
  category: 'real_estate',
  purchasePriceCents: 15000000, // $150k
  acquiredDate: '2020-06-15',
  valueHistory: [
    { valueCents: 15000000, date: '2020-06-15', note: 'Purchase price' },
    { valueCents: 16500000, date: '2022-01-01', note: 'Appraisal' },
    { valueCents: 18000000, date: '2024-01-01', note: 'Zillow estimate' },
  ],
};

const carAsset: ManualAsset = {
  id: 'a2',
  name: '2022 Tesla Model 3',
  category: 'vehicle',
  purchasePriceCents: 4500000, // $45k
  acquiredDate: '2022-03-01',
  valueHistory: [
    { valueCents: 4500000, date: '2022-03-01' },
    { valueCents: 3800000, date: '2023-03-01' },
    { valueCents: 3200000, date: '2024-03-01' },
  ],
};

const ringAsset: ManualAsset = {
  id: 'a3',
  name: 'Engagement Ring',
  category: 'jewelry',
  purchasePriceCents: 800000, // $8k
  acquiredDate: '2019-12-01',
  valueHistory: [{ valueCents: 1000000, date: '2024-06-01', note: 'Insurance appraisal' }],
};

const emptyAsset: ManualAsset = {
  id: 'a4',
  name: 'Unvalued Item',
  category: 'other',
  purchasePriceCents: null,
  acquiredDate: null,
  valueHistory: [],
};

// ---------------------------------------------------------------------------
// getCurrentValue
// ---------------------------------------------------------------------------

describe('getCurrentValue', () => {
  it('returns the most recent value entry', () => {
    expect(getCurrentValue(houseAsset)).toBe(18000000);
  });

  it('handles single value entry', () => {
    expect(getCurrentValue(ringAsset)).toBe(1000000);
  });

  it('returns 0 for empty value history', () => {
    expect(getCurrentValue(emptyAsset)).toBe(0);
  });

  it('finds the latest by date even if not last in array', () => {
    const scrambled: ManualAsset = {
      ...houseAsset,
      valueHistory: [
        { valueCents: 18000000, date: '2024-01-01' },
        { valueCents: 15000000, date: '2020-06-15' },
        { valueCents: 16500000, date: '2022-01-01' },
      ],
    };
    expect(getCurrentValue(scrambled)).toBe(18000000);
  });
});

// ---------------------------------------------------------------------------
// getValueChange
// ---------------------------------------------------------------------------

describe('getValueChange', () => {
  it('calculates appreciation', () => {
    expect(getValueChange(houseAsset)).toBe(3000000); // $30k gain
  });

  it('calculates depreciation', () => {
    expect(getValueChange(carAsset)).toBe(-1300000); // $13k loss
  });

  it('returns 0 for single entry', () => {
    expect(getValueChange(ringAsset)).toBe(0);
  });

  it('returns 0 for empty history', () => {
    expect(getValueChange(emptyAsset)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getValueChangePercent
// ---------------------------------------------------------------------------

describe('getValueChangePercent', () => {
  it('calculates appreciation percentage', () => {
    const pct = getValueChangePercent(houseAsset);
    expect(pct).toBe(20); // $30k / $150k = 20%
  });

  it('calculates depreciation percentage', () => {
    const pct = getValueChangePercent(carAsset);
    expect(pct).toBeCloseTo(-28.89, 1); // -$13k / $45k
  });

  it('returns 0 for single entry', () => {
    expect(getValueChangePercent(ringAsset)).toBe(0);
  });

  it('returns 0 for empty history', () => {
    expect(getValueChangePercent(emptyAsset)).toBe(0);
  });

  it('handles zero starting value', () => {
    const zeroStart: ManualAsset = {
      ...houseAsset,
      valueHistory: [
        { valueCents: 0, date: '2020-01-01' },
        { valueCents: 1000000, date: '2024-01-01' },
      ],
    };
    expect(getValueChangePercent(zeroStart)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getSortedValueHistory
// ---------------------------------------------------------------------------

describe('getSortedValueHistory', () => {
  it('returns entries sorted chronologically', () => {
    const sorted = getSortedValueHistory(houseAsset);
    expect(sorted[0].date).toBe('2020-06-15');
    expect(sorted[sorted.length - 1].date).toBe('2024-01-01');
  });

  it('returns empty array for empty history', () => {
    expect(getSortedValueHistory(emptyAsset)).toHaveLength(0);
  });

  it('does not mutate the original asset', () => {
    const original = [...houseAsset.valueHistory];
    getSortedValueHistory(houseAsset);
    expect(houseAsset.valueHistory).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// calculatePortfolioContribution
// ---------------------------------------------------------------------------

describe('calculatePortfolioContribution', () => {
  it('calculates contribution percentage', () => {
    const pct = calculatePortfolioContribution(houseAsset, 100000000);
    // $180k / $1M = 18%
    expect(pct).toBe(18);
  });

  it('returns 0 for zero total portfolio', () => {
    expect(calculatePortfolioContribution(houseAsset, 0)).toBe(0);
  });

  it('returns 0 for asset with no value', () => {
    expect(calculatePortfolioContribution(emptyAsset, 100000000)).toBe(0);
  });

  it('returns 100% when asset is the whole portfolio', () => {
    const pct = calculatePortfolioContribution(houseAsset, 18000000);
    expect(pct).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// buildPortfolioSummary
// ---------------------------------------------------------------------------

describe('buildPortfolioSummary', () => {
  const allAssets = [houseAsset, carAsset, ringAsset, emptyAsset];

  it('calculates total value across all assets', () => {
    const summary = buildPortfolioSummary(allAssets);
    // 18000000 + 3200000 + 1000000 + 0 = 22200000
    expect(summary.totalValueCents).toBe(22200000);
  });

  it('counts all assets', () => {
    const summary = buildPortfolioSummary(allAssets);
    expect(summary.assetCount).toBe(4);
  });

  it('includes only categories with assets', () => {
    const summary = buildPortfolioSummary(allAssets);
    const categories = summary.categoryBreakdown.map((c) => c.category);
    expect(categories).toContain('real_estate');
    expect(categories).toContain('vehicle');
    expect(categories).toContain('jewelry');
    expect(categories).toContain('other');
    expect(categories).not.toContain('collectible');
    expect(categories).not.toContain('art');
  });

  it('sorts by value descending', () => {
    const summary = buildPortfolioSummary(allAssets);
    for (let i = 1; i < summary.categoryBreakdown.length; i++) {
      expect(summary.categoryBreakdown[i].totalValueCents).toBeLessThanOrEqual(
        summary.categoryBreakdown[i - 1].totalValueCents,
      );
    }
  });

  it('percentages sum to approximately 100', () => {
    const summary = buildPortfolioSummary(allAssets);
    const totalPct = summary.categoryBreakdown.reduce((s, c) => s + c.percentOfTotal, 0);
    // Allow rounding tolerance
    expect(Math.abs(totalPct - 100)).toBeLessThan(1);
  });

  it('handles empty asset list', () => {
    const summary = buildPortfolioSummary([]);
    expect(summary.totalValueCents).toBe(0);
    expect(summary.assetCount).toBe(0);
    expect(summary.categoryBreakdown).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// filterByCategory
// ---------------------------------------------------------------------------

describe('filterByCategory', () => {
  const allAssets = [houseAsset, carAsset, ringAsset, emptyAsset];

  it('filters to the specified category', () => {
    const vehicles = filterByCategory(allAssets, 'vehicle');
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].id).toBe('a2');
  });

  it('returns empty array for category with no assets', () => {
    expect(filterByCategory(allAssets, 'art')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// calculateTotalValue
// ---------------------------------------------------------------------------

describe('calculateTotalValue', () => {
  it('sums current values of all assets', () => {
    const total = calculateTotalValue([houseAsset, carAsset, ringAsset]);
    expect(total).toBe(18000000 + 3200000 + 1000000);
  });

  it('returns 0 for empty array', () => {
    expect(calculateTotalValue([])).toBe(0);
  });

  it('handles assets with no value history', () => {
    expect(calculateTotalValue([emptyAsset])).toBe(0);
  });
});
