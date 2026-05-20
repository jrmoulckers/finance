// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import { AccountTaxType, AssetClass, TaxEfficiency } from './types';
import type { AssetHolding } from './types';
import {
  getAssetTaxEfficiency,
  getRecommendedPlacement,
  calculateTaxEquivalentYield,
  analyzeAssetPlacement,
  analyzeTaxLocation,
  projectTaxSavings,
} from './tax-location';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeHolding(overrides: Partial<AssetHolding> = {}): AssetHolding {
  return {
    assetId: 'VTI',
    name: 'Vanguard Total Stock Market',
    assetClass: AssetClass.US_STOCKS,
    valueCents: 100_000_00,
    annualYield: 0.02,
    costBasisCents: 80_000_00,
    accountId: 'acct-1',
    accountTaxType: AccountTaxType.TAXABLE,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('tax-location', () => {
  describe('getAssetTaxEfficiency', () => {
    it('classifies US stocks as HIGH efficiency', () => {
      expect(getAssetTaxEfficiency(AssetClass.US_STOCKS)).toBe(TaxEfficiency.HIGH);
    });

    it('classifies bonds as LOW efficiency', () => {
      expect(getAssetTaxEfficiency(AssetClass.BONDS)).toBe(TaxEfficiency.LOW);
    });

    it('classifies REITs as LOW efficiency', () => {
      expect(getAssetTaxEfficiency(AssetClass.REITS)).toBe(TaxEfficiency.LOW);
    });

    it('classifies commodities as MODERATE efficiency', () => {
      expect(getAssetTaxEfficiency(AssetClass.COMMODITIES)).toBe(TaxEfficiency.MODERATE);
    });

    it('classifies municipal bonds as HIGH efficiency', () => {
      expect(getAssetTaxEfficiency(AssetClass.MUNICIPAL_BONDS)).toBe(TaxEfficiency.HIGH);
    });
  });

  describe('getRecommendedPlacement', () => {
    it('recommends TAXABLE for US stocks', () => {
      expect(getRecommendedPlacement(AssetClass.US_STOCKS)).toBe(AccountTaxType.TAXABLE);
    });

    it('recommends TAX_DEFERRED for bonds', () => {
      expect(getRecommendedPlacement(AssetClass.BONDS)).toBe(AccountTaxType.TAX_DEFERRED);
    });

    it('recommends TAX_DEFERRED for REITs', () => {
      expect(getRecommendedPlacement(AssetClass.REITS)).toBe(AccountTaxType.TAX_DEFERRED);
    });

    it('recommends TAX_FREE for TIPS', () => {
      expect(getRecommendedPlacement(AssetClass.TIPS)).toBe(AccountTaxType.TAX_FREE);
    });

    it('recommends TAXABLE for international stocks (foreign tax credit)', () => {
      expect(getRecommendedPlacement(AssetClass.INTERNATIONAL_STOCKS)).toBe(AccountTaxType.TAXABLE);
    });

    it('recommends TAXABLE for municipal bonds', () => {
      expect(getRecommendedPlacement(AssetClass.MUNICIPAL_BONDS)).toBe(AccountTaxType.TAXABLE);
    });
  });

  describe('calculateTaxEquivalentYield', () => {
    it('calculates TEY correctly', () => {
      const tey = calculateTaxEquivalentYield(0.03, 0.32);
      // 0.03 / (1 - 0.32) = 0.04411...
      expect(tey.taxEquivalentYield).toBeCloseTo(0.0441, 3);
      expect(tey.marginalRate).toBe(0.32);
      expect(tey.isTaxExemptBetter).toBe(true);
    });

    it('handles zero marginal rate', () => {
      const tey = calculateTaxEquivalentYield(0.03, 0);
      expect(tey.taxEquivalentYield).toBe(0.03);
      expect(tey.isTaxExemptBetter).toBe(false);
    });

    it('guards against marginal rate = 1 (divide by zero)', () => {
      const tey = calculateTaxEquivalentYield(0.03, 1.0);
      // Denominator = 0, falls back to nominal
      expect(tey.taxEquivalentYield).toBe(0.03);
    });

    it('guards against marginal rate > 1', () => {
      const tey = calculateTaxEquivalentYield(0.03, 1.5);
      // Negative denominator, falls back to nominal
      expect(tey.taxEquivalentYield).toBe(0.03);
    });
  });

  describe('analyzeAssetPlacement', () => {
    it('marks US stocks in taxable as optimal', () => {
      const placement = analyzeAssetPlacement(makeHolding(), 0.22);
      expect(placement.isOptimal).toBe(true);
      expect(placement.estimatedAnnualSavingsCents).toBe(0);
    });

    it('marks bonds in taxable as sub-optimal', () => {
      const placement = analyzeAssetPlacement(
        makeHolding({
          assetClass: AssetClass.BONDS,
          accountTaxType: AccountTaxType.TAXABLE,
          annualYield: 0.04,
        }),
        0.24,
      );
      expect(placement.isOptimal).toBe(false);
      expect(placement.recommendedAccountTaxType).toBe(AccountTaxType.TAX_DEFERRED);
      expect(placement.estimatedAnnualSavingsCents).toBeGreaterThan(0);
    });

    it('marks bonds in tax-deferred as optimal', () => {
      const placement = analyzeAssetPlacement(
        makeHolding({
          assetClass: AssetClass.BONDS,
          accountTaxType: AccountTaxType.TAX_DEFERRED,
        }),
        0.24,
      );
      expect(placement.isOptimal).toBe(true);
    });

    it('calculates savings based on yield and marginal rate', () => {
      const placement = analyzeAssetPlacement(
        makeHolding({
          assetClass: AssetClass.REITS,
          accountTaxType: AccountTaxType.TAXABLE,
          valueCents: 200_000_00,
          annualYield: 0.05,
        }),
        0.32,
      );
      // Annual distributions: 200,000 * 0.05 = 10,000
      // Tax savings: 10,000 * 0.32 = 3,200
      expect(placement.estimatedAnnualSavingsCents).toBe(3_200_00);
    });

    it('returns zero savings when marginal rate is zero', () => {
      const placement = analyzeAssetPlacement(
        makeHolding({
          assetClass: AssetClass.BONDS,
          accountTaxType: AccountTaxType.TAXABLE,
        }),
        0,
      );
      expect(placement.estimatedAnnualSavingsCents).toBe(0);
    });
  });

  describe('analyzeTaxLocation', () => {
    it('summarizes all holdings', () => {
      const holdings = [
        makeHolding(), // US stocks in taxable — optimal
        makeHolding({
          assetId: 'BND',
          name: 'Bond Fund',
          assetClass: AssetClass.BONDS,
          accountTaxType: AccountTaxType.TAXABLE,
          annualYield: 0.04,
        }), // Sub-optimal
      ];
      const summary = analyzeTaxLocation(holdings, 0.22);
      expect(summary.optimalCount).toBe(1);
      expect(summary.suboptimalCount).toBe(1);
      expect(summary.totalAnnualSavingsCents).toBeGreaterThan(0);
      expect(summary.placements).toHaveLength(2);
    });

    it('handles empty holdings', () => {
      const summary = analyzeTaxLocation([], 0.22);
      expect(summary.optimalCount).toBe(0);
      expect(summary.suboptimalCount).toBe(0);
      expect(summary.totalAnnualSavingsCents).toBe(0);
    });

    it('reports all optimal when everything is correctly placed', () => {
      const holdings = [
        makeHolding(), // US stocks in taxable
        makeHolding({
          assetId: 'BND',
          assetClass: AssetClass.BONDS,
          accountTaxType: AccountTaxType.TAX_DEFERRED,
        }),
      ];
      const summary = analyzeTaxLocation(holdings, 0.22);
      expect(summary.optimalCount).toBe(2);
      expect(summary.suboptimalCount).toBe(0);
      expect(summary.totalAnnualSavingsCents).toBe(0);
    });
  });

  describe('projectTaxSavings', () => {
    it('projects savings over multiple years with growth', () => {
      const savings = projectTaxSavings(100_000_00, 0.04, 0.24, 5);
      expect(savings).toBeGreaterThan(0);
      // Should be more than 5 × single-year savings due to reinvestment
      const singleYear = Math.round(100_000_00 * 0.04 * 0.24);
      expect(savings).toBeGreaterThan(singleYear * 5 - 100); // allow rounding
    });

    it('returns zero for zero years', () => {
      expect(projectTaxSavings(100_000_00, 0.04, 0.24, 0)).toBe(0);
    });

    it('returns zero for zero yield', () => {
      expect(projectTaxSavings(100_000_00, 0, 0.24, 5)).toBe(0);
    });

    it('returns zero for zero marginal rate', () => {
      expect(projectTaxSavings(100_000_00, 0.04, 0, 5)).toBe(0);
    });

    it('returns zero for negative years', () => {
      expect(projectTaxSavings(100_000_00, 0.04, 0.24, -3)).toBe(0);
    });
  });
});
