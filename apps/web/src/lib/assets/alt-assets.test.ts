// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  annualizedAppreciation,
  assetAppreciation,
  assetAppreciationPercent,
  computeAltAssetSummary,
  computeCategoryAllocation,
  filterByCategory,
  insuranceCoverageGap,
  latestValuation,
} from './alt-assets';
import type { AlternativeAsset } from './types';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const art: AlternativeAsset = {
  id: 'a1',
  name: 'Banksy Print',
  category: 'ART',
  purchasePriceCents: 500000,
  purchaseDate: '2020-06-15',
  currentValueCents: 750000,
  valuationHistory: [
    { date: '2021-06-15', valueCents: 600000 },
    { date: '2022-06-15', valueCents: 700000 },
    { date: '2023-06-15', valueCents: 750000 },
  ],
  insuranceValueCents: 700000,
};

const watch: AlternativeAsset = {
  id: 'a2',
  name: 'Rolex Submariner',
  category: 'WATCHES',
  purchasePriceCents: 1200000,
  purchaseDate: '2019-01-01',
  currentValueCents: 1800000,
  valuationHistory: [
    { date: '2023-01-01', valueCents: 1700000 },
    { date: '2024-01-01', valueCents: 1800000 },
  ],
  insuranceValueCents: 1500000,
};

const wine: AlternativeAsset = {
  id: 'a3',
  name: '2015 Pétrus',
  category: 'WINE',
  purchasePriceCents: 300000,
  purchaseDate: '2021-03-01',
  currentValueCents: 350000,
  valuationHistory: [],
};

const assets: AlternativeAsset[] = [art, watch, wine];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('assetAppreciation', () => {
  it('computes positive appreciation', () => {
    // 750000 - 500000 = 250000
    expect(assetAppreciation(art)).toBe(250000);
  });

  it('computes large appreciation', () => {
    // 1800000 - 1200000 = 600000
    expect(assetAppreciation(watch)).toBe(600000);
  });
});

describe('assetAppreciationPercent', () => {
  it('computes percentage', () => {
    // 250000 / 500000 * 100 = 50%
    expect(assetAppreciationPercent(art)).toBe(50);
  });

  it('returns 0 for zero cost', () => {
    const free = { ...art, purchasePriceCents: 0 };
    expect(assetAppreciationPercent(free)).toBe(0);
  });
});

describe('annualizedAppreciation', () => {
  it('computes CAGR', () => {
    // Art: 500K → 750K over ~3 years ≈ 14.47% CAGR
    const cagr = annualizedAppreciation(art, '2023-06-15');
    expect(cagr).toBeGreaterThan(10);
    expect(cagr).toBeLessThan(20);
  });

  it('returns 0 for zero cost', () => {
    const free = { ...art, purchasePriceCents: 0 };
    expect(annualizedAppreciation(free, '2023-06-15')).toBe(0);
  });

  it('returns 0 for same-day purchase', () => {
    expect(annualizedAppreciation(art, art.purchaseDate)).toBe(0);
  });
});

describe('latestValuation', () => {
  it('returns most recent valuation', () => {
    const latest = latestValuation(art.valuationHistory);
    expect(latest?.date).toBe('2023-06-15');
    expect(latest?.valueCents).toBe(750000);
  });

  it('returns undefined for empty history', () => {
    expect(latestValuation([])).toBeUndefined();
  });
});

describe('computeCategoryAllocation', () => {
  it('groups by category with percentages', () => {
    const alloc = computeCategoryAllocation(assets);
    expect(alloc).toHaveLength(3);
    // Watch is most valuable → first
    expect(alloc[0].category).toBe('WATCHES');
  });

  it('returns empty for no assets', () => {
    expect(computeCategoryAllocation([])).toEqual([]);
  });
});

describe('computeAltAssetSummary', () => {
  it('computes full summary', () => {
    const summary = computeAltAssetSummary(assets);
    // Total value: 750K + 1.8M + 350K = 2.9M
    expect(summary.totalValueCents).toBe(2900000);
    // Total cost: 500K + 1.2M + 300K = 2M
    expect(summary.totalCostCents).toBe(2000000);
    expect(summary.totalAppreciationCents).toBe(900000);
    // Insurance: 700K + 1.5M + 0 = 2.2M
    expect(summary.totalInsuranceValueCents).toBe(2200000);
    expect(summary.assetCount).toBe(3);
  });

  it('returns zeros for empty assets', () => {
    const summary = computeAltAssetSummary([]);
    expect(summary.totalValueCents).toBe(0);
    expect(summary.assetCount).toBe(0);
  });
});

describe('insuranceCoverageGap', () => {
  it('computes underinsured gap', () => {
    // Art: 750000 - 700000 = 50000
    expect(insuranceCoverageGap(art)).toBe(50000);
  });

  it('computes gap for uninsured asset', () => {
    // Wine: 350000 - 0 = 350000
    expect(insuranceCoverageGap(wine)).toBe(350000);
  });
});

describe('filterByCategory', () => {
  it('filters to specific category', () => {
    const result = filterByCategory(assets, 'ART');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });
});
