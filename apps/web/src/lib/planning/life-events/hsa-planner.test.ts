// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for HSA planning engine.
 *
 * References: #1738
 */

import { describe, it, expect } from 'vitest';
import {
  getContributionLimits,
  calculateTripleTaxSavings,
  generateHsaProjection,
  analyzeHsaPlan,
} from './hsa-planner';
import type { HsaPlanParams } from './types';

// ---------------------------------------------------------------------------
// getContributionLimits
// ---------------------------------------------------------------------------

describe('getContributionLimits', () => {
  it('returns individual limit for under 55', () => {
    const limits = getContributionLimits('individual', 40);
    expect(limits.limitCents).toBe(415_000); // $4,150
    expect(limits.catchUpCents).toBe(0);
    expect(limits.maxCents).toBe(415_000);
  });

  it('returns family limit for under 55', () => {
    const limits = getContributionLimits('family', 40);
    expect(limits.limitCents).toBe(830_000); // $8,300
    expect(limits.catchUpCents).toBe(0);
    expect(limits.maxCents).toBe(830_000);
  });

  it('includes catch-up at 55', () => {
    const limits = getContributionLimits('individual', 55);
    expect(limits.catchUpCents).toBe(100_000); // $1,000
    expect(limits.maxCents).toBe(515_000); // $4,150 + $1,000
  });

  it('includes catch-up at 60', () => {
    const limits = getContributionLimits('family', 60);
    expect(limits.catchUpCents).toBe(100_000);
    expect(limits.maxCents).toBe(930_000); // $8,300 + $1,000
  });
});

// ---------------------------------------------------------------------------
// calculateTripleTaxSavings
// ---------------------------------------------------------------------------

describe('calculateTripleTaxSavings', () => {
  it('calculates all three tax savings', () => {
    // $4,150 contribution at 22% fed, 5% state, 7.65% FICA
    const savings = calculateTripleTaxSavings(415_000, 2200, 500, 765);

    // Federal: $4,150 × 22% = $913
    expect(savings.federalCents).toBe(91_300);
    // State: $4,150 × 5% = $207.50
    expect(savings.stateCents).toBe(20_750);
    // FICA: $4,150 × 7.65% = $317.48
    expect(savings.ficaCents).toBe(31_748);

    expect(savings.totalCents).toBe(savings.federalCents + savings.stateCents + savings.ficaCents);
  });

  it('handles zero contribution', () => {
    const savings = calculateTripleTaxSavings(0, 2200, 500, 765);
    expect(savings.totalCents).toBe(0);
  });

  it('handles zero tax rates', () => {
    const savings = calculateTripleTaxSavings(415_000, 0, 0, 0);
    expect(savings.totalCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// generateHsaProjection
// ---------------------------------------------------------------------------

describe('generateHsaProjection', () => {
  it('projects to Medicare age', () => {
    const points = generateHsaProjection(
      500_000, // $5,000 balance
      415_000, // $4,150/yr contribution
      40,
      600, // 6% return
      100_000, // $1,000/yr medical
      'individual',
    );
    // Should include ages 40 through 65
    expect(points[0].age).toBe(40);
    expect(points[points.length - 1].age).toBe(65);
    expect(points).toHaveLength(26);
  });

  it('balance grows over time with investment', () => {
    const points = generateHsaProjection(
      500_000,
      415_000,
      40,
      600,
      0, // No medical spending
      'individual',
    );
    // Balance should increase year over year
    for (let i = 1; i < points.length; i++) {
      expect(points[i].balanceCents).toBeGreaterThan(points[i - 1].balanceCents);
    }
  });

  it('handles person already at Medicare age', () => {
    const points = generateHsaProjection(1_000_000, 415_000, 65, 600, 100_000, 'individual');
    // Should still produce at least 2 points (age 65 and 66)
    expect(points.length).toBeGreaterThanOrEqual(2);
  });

  it('does not contribute after Medicare age', () => {
    const points = generateHsaProjection(
      1_000_000,
      415_000,
      64,
      0, // No growth for simplicity
      0,
      'individual',
    );
    // At age 64, contribution is added. At 65, no contribution.
    const at64 = points.find((p) => p.age === 64);
    const at65 = points.find((p) => p.age === 65);
    expect(at64).toBeDefined();
    expect(at65).toBeDefined();
    // The 65 point should include the contribution from 64
    expect(at65!.balanceCents).toBe(at64!.balanceCents + 415_000);
  });
});

// ---------------------------------------------------------------------------
// analyzeHsaPlan — integration
// ---------------------------------------------------------------------------

describe('analyzeHsaPlan', () => {
  const baseParams: HsaPlanParams = {
    coverageType: 'individual',
    currentBalanceCents: 500_000, // $5,000
    annualContributionCents: 415_000, // $4,150
    currentAge: 35,
    annualReturnBps: 600, // 6%
    federalTaxRateBps: 2200, // 22%
    stateTaxRateBps: 500, // 5%
    ficaTaxRateBps: 765, // 7.65%
    annualMedicalExpensesCents: 100_000, // $1,000
    investContributions: true,
  };

  it('returns correct contribution limits', () => {
    const result = analyzeHsaPlan(baseParams);
    expect(result.contributionLimitCents).toBe(415_000);
    expect(result.catchUpAmountCents).toBe(0);
    expect(result.maxContributionCents).toBe(415_000);
  });

  it('does not exceed limit at max contribution', () => {
    const result = analyzeHsaPlan(baseParams);
    expect(result.exceedsLimit).toBe(false);
  });

  it('flags when exceeding contribution limit', () => {
    const result = analyzeHsaPlan({
      ...baseParams,
      annualContributionCents: 500_000, // Over $4,150 limit
    });
    expect(result.exceedsLimit).toBe(true);
  });

  it('calculates tax savings', () => {
    const result = analyzeHsaPlan(baseParams);
    expect(result.annualTaxSavingsCents).toBeGreaterThan(0);
    expect(result.annualTaxSavingsCents).toBe(
      result.federalTaxSavingsCents + result.stateTaxSavingsCents + result.ficaTaxSavingsCents,
    );
  });

  it('calculates years to Medicare', () => {
    const result = analyzeHsaPlan(baseParams);
    expect(result.yearsToMedicare).toBe(30); // 65 - 35
  });

  it('projects balance at 65', () => {
    const result = analyzeHsaPlan(baseParams);
    expect(result.projectedBalanceAt65Cents).toBeGreaterThan(baseParams.currentBalanceCents);
  });

  it('handles age 65+', () => {
    const result = analyzeHsaPlan({
      ...baseParams,
      currentAge: 67,
    });
    expect(result.yearsToMedicare).toBe(0);
    expect(result.projectionPoints.length).toBeGreaterThanOrEqual(1);
  });

  it('handles non-invested HSA', () => {
    const result = analyzeHsaPlan({
      ...baseParams,
      investContributions: false,
    });
    // Balance should grow only from contributions minus medical
    expect(result.projectedBalanceAt65Cents).toBeGreaterThan(0);
    // Should be less than invested version
    const investedResult = analyzeHsaPlan(baseParams);
    expect(result.projectedBalanceAt65Cents).toBeLessThan(investedResult.projectedBalanceAt65Cents);
  });
});
