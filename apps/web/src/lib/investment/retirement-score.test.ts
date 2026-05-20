// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the retirement readiness score, income gap, and Social Security estimator.
 *
 * Uses known financial test vectors including 2024 SSA bend points.
 *
 * References: issue #1683
 */

import { describe, expect, it } from 'vitest';
import type { RetirementInput, SocialSecurityInput } from './types';
import {
  calculatePIA,
  calculateRequiredPortfolio,
  calculateRetirementScore,
  calculateSSAdjustmentFactor,
  estimateSocialSecurity,
  projectPortfolioAtRetirement,
} from './retirement-score';

// ---------------------------------------------------------------------------
// calculatePIA
// ---------------------------------------------------------------------------

describe('calculatePIA', () => {
  it('returns 0 for zero AIME', () => {
    expect(calculatePIA(0)).toBe(0);
  });

  it('applies 90% for AIME below first bend point', () => {
    // AIME = $1,000 → PIA = $1,000 × 0.90 = $900
    const pia = calculatePIA(1000_00);
    expect(pia).toBe(900_00);
  });

  it('applies bend points correctly for mid-range AIME', () => {
    // AIME = $5,000
    // 90% of $1,174 = $1,056.60
    // 32% of ($5,000 - $1,174) = 32% of $3,826 = $1,224.32
    // PIA = $2,280.92 → rounded = $2,280.92
    const pia = calculatePIA(5000_00);
    const expected = Math.round(1174_00 * 0.9 + (5000_00 - 1174_00) * 0.32);
    expect(pia).toBe(expected);
  });

  it('applies all three bend points for high AIME', () => {
    // AIME = $10,000
    // 90% of $1,174 = $1,056.60
    // 32% of ($7,078 - $1,174) = $1,888.28 (rounding at end)
    // 15% of ($10,000 - $7,078) = $438.30
    const pia = calculatePIA(10000_00);
    const expected = Math.round(
      1174_00 * 0.9 + (7078_00 - 1174_00) * 0.32 + (10000_00 - 7078_00) * 0.15,
    );
    expect(pia).toBe(expected);
  });

  it('returns 0 for negative AIME', () => {
    expect(calculatePIA(-1000_00)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateSSAdjustmentFactor
// ---------------------------------------------------------------------------

describe('calculateSSAdjustmentFactor', () => {
  it('returns 1.0 at full retirement age', () => {
    expect(calculateSSAdjustmentFactor(67, 67)).toBe(1.0);
  });

  it('reduces benefit for early claiming at 62', () => {
    const factor = calculateSSAdjustmentFactor(62, 67);
    expect(factor).toBeLessThan(1.0);
    // 60 months early: 36 × 5/900 + 24 × 5/1200 = 0.2 + 0.1 = 0.3
    // Factor = 0.7
    expect(factor).toBeCloseTo(0.7, 2);
  });

  it('increases benefit for delayed claiming at 70', () => {
    const factor = calculateSSAdjustmentFactor(70, 67);
    expect(factor).toBeGreaterThan(1.0);
    // 36 months delayed × 2/300 = 0.24 → factor = 1.24
    expect(factor).toBeCloseTo(1.24, 2);
  });

  it('caps delayed credits at 36 months', () => {
    // Claiming at 72 should not give more than claiming at 70
    const at70 = calculateSSAdjustmentFactor(70, 67);
    const at72 = calculateSSAdjustmentFactor(72, 67);
    expect(at72).toBe(at70);
  });
});

// ---------------------------------------------------------------------------
// estimateSocialSecurity
// ---------------------------------------------------------------------------

describe('estimateSocialSecurity', () => {
  it('estimates benefit at FRA', () => {
    const input: SocialSecurityInput = {
      aimeCents: 5000_00,
      fullRetirementAge: 67,
      claimingAge: 67,
    };
    const result = estimateSocialSecurity(input);

    expect(result.adjustmentFactor).toBe(1.0);
    expect(result.adjustedMonthlyCents).toBe(result.piaMonthlyCents);
    expect(result.annualBenefitCents).toBe(result.adjustedMonthlyCents * 12);
  });

  it('reduces benefit for early claiming', () => {
    const atFRA = estimateSocialSecurity({
      aimeCents: 5000_00,
      fullRetirementAge: 67,
      claimingAge: 67,
    });
    const early = estimateSocialSecurity({
      aimeCents: 5000_00,
      fullRetirementAge: 67,
      claimingAge: 62,
    });

    expect(early.adjustedMonthlyCents).toBeLessThan(atFRA.adjustedMonthlyCents);
  });

  it('increases benefit for delayed claiming', () => {
    const atFRA = estimateSocialSecurity({
      aimeCents: 5000_00,
      fullRetirementAge: 67,
      claimingAge: 67,
    });
    const delayed = estimateSocialSecurity({
      aimeCents: 5000_00,
      fullRetirementAge: 67,
      claimingAge: 70,
    });

    expect(delayed.adjustedMonthlyCents).toBeGreaterThan(atFRA.adjustedMonthlyCents);
  });
});

// ---------------------------------------------------------------------------
// projectPortfolioAtRetirement
// ---------------------------------------------------------------------------

describe('projectPortfolioAtRetirement', () => {
  it('projects growth with contributions', () => {
    // $100k now, $10k/yr savings, 7% return, 20 years
    const projected = projectPortfolioAtRetirement(100000_00, 10000_00, 7, 20);
    expect(projected).toBeGreaterThan(100000_00 + 10000_00 * 20);
  });

  it('returns current value for zero years', () => {
    const projected = projectPortfolioAtRetirement(100000_00, 10000_00, 7, 0);
    expect(projected).toBe(100000_00);
  });

  it('handles zero return rate', () => {
    const projected = projectPortfolioAtRetirement(100000_00, 10000_00, 0, 10);
    expect(projected).toBe(100000_00 + 10000_00 * 10);
  });
});

// ---------------------------------------------------------------------------
// calculateRequiredPortfolio
// ---------------------------------------------------------------------------

describe('calculateRequiredPortfolio', () => {
  it('calculates required portfolio for 30-year retirement', () => {
    // $50k/yr expenses, 5% return, 3% inflation, 30 years, no other income
    const required = calculateRequiredPortfolio(50000_00, 5, 3, 30, 0);
    expect(required).toBeGreaterThan(0);
    // Should be less than 50k × 30 due to investment returns
    expect(required).toBeLessThan(50000_00 * 30);
  });

  it('reduces requirement with other income', () => {
    const withoutSS = calculateRequiredPortfolio(50000_00, 5, 3, 30, 0);
    const withSS = calculateRequiredPortfolio(50000_00, 5, 3, 30, 20000_00);
    expect(withSS).toBeLessThan(withoutSS);
  });

  it('returns 0 when other income covers expenses', () => {
    const required = calculateRequiredPortfolio(50000_00, 5, 3, 30, 60000_00);
    expect(required).toBe(0);
  });

  it('returns 0 for zero years', () => {
    expect(calculateRequiredPortfolio(50000_00, 5, 3, 0, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateRetirementScore
// ---------------------------------------------------------------------------

describe('calculateRetirementScore', () => {
  const baseInput: RetirementInput = {
    currentPortfolioCents: 500000_00,
    annualExpensesCents: 50000_00,
    currentAge: 40,
    retirementAge: 65,
    lifeExpectancy: 90,
    expectedReturnPercent: 5,
    inflationRatePercent: 3,
    socialSecurityAnnualCents: 24000_00,
    pensionAnnualCents: 0,
    annualSavingsCents: 30000_00,
    preRetirementReturnPercent: 7,
  };

  it('returns score between 0 and 100', () => {
    const result = calculateRetirementScore(baseInput);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('returns a valid category', () => {
    const result = calculateRetirementScore(baseInput);
    expect(['CRITICAL', 'NEEDS_WORK', 'ON_TRACK', 'STRONG', 'EXCELLENT']).toContain(
      result.category,
    );
  });

  it('includes income sources breakdown', () => {
    const result = calculateRetirementScore(baseInput);
    expect(result.incomeSources.socialSecurityCents).toBe(24000_00);
    expect(result.incomeSources.pensionCents).toBe(0);
    expect(result.incomeSources.totalAnnualIncomeCents).toBeGreaterThan(0);
  });

  it('scores higher with more savings', () => {
    const lowSave = calculateRetirementScore({
      ...baseInput,
      annualSavingsCents: 10000_00,
    });
    const highSave = calculateRetirementScore({
      ...baseInput,
      annualSavingsCents: 80000_00,
    });
    expect(highSave.score).toBeGreaterThanOrEqual(lowSave.score);
  });

  it('scores higher with pension income', () => {
    const noPension = calculateRetirementScore(baseInput);
    const withPension = calculateRetirementScore({
      ...baseInput,
      pensionAnnualCents: 20000_00,
    });
    expect(withPension.score).toBeGreaterThanOrEqual(noPension.score);
  });

  it('calculates income gap as shortfall', () => {
    const result = calculateRetirementScore(baseInput);
    // Income gap should be >= 0 (it's a shortfall, never negative)
    expect(result.incomeGapCents).toBeGreaterThanOrEqual(0);
  });

  it('projects portfolio at retirement', () => {
    const result = calculateRetirementScore(baseInput);
    expect(result.projectedPortfolioAtRetirementCents).toBeGreaterThan(
      baseInput.currentPortfolioCents,
    );
  });

  it('handles already-retired scenario', () => {
    const retired = calculateRetirementScore({
      ...baseInput,
      currentAge: 70,
      retirementAge: 65,
    });
    // Should still return a valid score
    expect(retired.score).toBeGreaterThanOrEqual(0);
    expect(retired.score).toBeLessThanOrEqual(100);
  });
});
