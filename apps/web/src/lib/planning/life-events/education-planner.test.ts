// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for education funding planner (529 and tuition projection).
 *
 * References: #1738, #1763
 */

import { describe, it, expect } from 'vitest';
import {
  projectTotalCost,
  projectBalance,
  calculateRequiredContribution,
  calculateTaxBenefit,
  suggestAllocation,
  generateProjectionPoints,
  analyzeEducationFund,
} from './education-planner';
import type { EducationFundParams } from './types';

// ---------------------------------------------------------------------------
// projectTotalCost
// ---------------------------------------------------------------------------

describe('projectTotalCost', () => {
  it('projects 4-year cost with 5% inflation', () => {
    // $30,000/yr current, 10 years out, 4 years of school
    const cost = projectTotalCost(3_000_000, 10, 4, 500);
    // Year 10: ~$48,867; Year 11: ~$51,310; Year 12: ~$53,876; Year 13: ~$56,569
    // Total ≈ $210,622
    expect(cost).toBeGreaterThan(20_000_000);
    expect(cost).toBeLessThan(22_000_000);
  });

  it('returns current cost when years is 0', () => {
    // No inflation period, 1 year of school starting now
    const cost = projectTotalCost(3_000_000, 0, 1, 500);
    expect(cost).toBe(3_000_000);
  });

  it('handles zero tuition', () => {
    expect(projectTotalCost(0, 10, 4, 500)).toBe(0);
  });

  it('handles zero inflation', () => {
    // No inflation: 4 × $30,000 = $120,000
    const cost = projectTotalCost(3_000_000, 10, 4, 0);
    expect(cost).toBe(12_000_000);
  });
});

// ---------------------------------------------------------------------------
// projectBalance
// ---------------------------------------------------------------------------

describe('projectBalance', () => {
  it('projects growth with contributions', () => {
    // $10,000 initial + $500/mo for 10 years at 7%
    const balance = projectBalance(1_000_000, 50_000, 10, 700);
    expect(balance).toBeGreaterThan(10_000_000);
  });

  it('returns current balance when years is 0', () => {
    expect(projectBalance(1_000_000, 50_000, 0, 700)).toBe(1_000_000);
  });

  it('handles zero initial balance', () => {
    const balance = projectBalance(0, 50_000, 10, 700);
    expect(balance).toBeGreaterThan(0);
  });

  it('handles zero contributions', () => {
    // $10,000 compounded monthly at 7% for 10 years ≈ $20,097
    const balance = projectBalance(1_000_000, 0, 10, 700);
    expect(balance).toBeGreaterThan(1_990_000);
    expect(balance).toBeLessThan(2_020_000);
  });

  it('handles zero return rate', () => {
    // $10,000 + $500 × 120 months = $70,000
    const balance = projectBalance(1_000_000, 50_000, 10, 0);
    expect(balance).toBe(7_000_000);
  });
});

// ---------------------------------------------------------------------------
// calculateRequiredContribution
// ---------------------------------------------------------------------------

describe('calculateRequiredContribution', () => {
  it('returns 0 when fully funded', () => {
    expect(calculateRequiredContribution(10_000_000, 15_000_000, 10, 700)).toBe(0);
  });

  it('calculates required monthly contribution', () => {
    // Need $200K, have $10K, 10 years at 7%
    const required = calculateRequiredContribution(20_000_000, 1_000_000, 10, 700);
    expect(required).toBeGreaterThan(0);
    expect(required).toBeLessThan(200_000); // Should be reasonable
  });

  it('returns full gap when years is 0', () => {
    const gap = calculateRequiredContribution(10_000_000, 3_000_000, 0, 700);
    expect(gap).toBe(7_000_000);
  });

  it('handles zero return rate', () => {
    // $100K gap / 120 months ≈ $833/mo
    const required = calculateRequiredContribution(11_000_000, 1_000_000, 10, 0);
    expect(required).toBe(83_333);
  });
});

// ---------------------------------------------------------------------------
// calculateTaxBenefit
// ---------------------------------------------------------------------------

describe('calculateTaxBenefit', () => {
  it('calculates state tax benefit', () => {
    // $6,000/yr × 5% state tax = $300
    expect(calculateTaxBenefit(600_000, 500)).toBe(30_000);
  });

  it('caps at gift tax exclusion', () => {
    // $25,000 contribution, but capped at $18,000 for benefit
    // $18,000 × 5% = $900
    expect(calculateTaxBenefit(2_500_000, 500)).toBe(90_000);
  });

  it('handles zero contribution', () => {
    expect(calculateTaxBenefit(0, 500)).toBe(0);
  });

  it('handles zero tax rate', () => {
    expect(calculateTaxBenefit(600_000, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// suggestAllocation
// ---------------------------------------------------------------------------

describe('suggestAllocation', () => {
  it('suggests aggressive for 15+ years', () => {
    const alloc = suggestAllocation(16);
    expect(alloc.equityPercent).toBe(90);
    expect(alloc.bondPercent).toBe(10);
    expect(alloc.cashPercent).toBe(0);
  });

  it('suggests growth for 10-14 years', () => {
    const alloc = suggestAllocation(12);
    expect(alloc.equityPercent).toBe(70);
  });

  it('suggests moderate for 5-9 years', () => {
    const alloc = suggestAllocation(7);
    expect(alloc.equityPercent).toBe(50);
  });

  it('suggests conservative for 2-4 years', () => {
    const alloc = suggestAllocation(3);
    expect(alloc.equityPercent).toBe(25);
  });

  it('suggests capital preservation for under 2 years', () => {
    const alloc = suggestAllocation(1);
    expect(alloc.equityPercent).toBe(10);
    expect(alloc.cashPercent).toBe(60);
  });

  it('allocation percentages sum to 100', () => {
    for (const years of [0, 1, 3, 7, 12, 20]) {
      const a = suggestAllocation(years);
      expect(a.equityPercent + a.bondPercent + a.cashPercent).toBe(100);
    }
  });
});

// ---------------------------------------------------------------------------
// generateProjectionPoints
// ---------------------------------------------------------------------------

describe('generateProjectionPoints', () => {
  it('generates correct number of points', () => {
    const points = generateProjectionPoints(1_000_000, 50_000, 10, 700);
    // 0 through 10 = 11 points
    expect(points).toHaveLength(11);
  });

  it('first point matches initial balance', () => {
    const points = generateProjectionPoints(1_000_000, 50_000, 10, 700);
    expect(points[0].balanceCents).toBe(1_000_000);
    expect(points[0].totalContributionsCents).toBe(0);
    expect(points[0].earningsCents).toBe(0);
  });

  it('balance increases over time', () => {
    const points = generateProjectionPoints(1_000_000, 50_000, 5, 700);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].balanceCents).toBeGreaterThan(points[i - 1].balanceCents);
    }
  });
});

// ---------------------------------------------------------------------------
// analyzeEducationFund — integration
// ---------------------------------------------------------------------------

describe('analyzeEducationFund', () => {
  const baseParams: EducationFundParams = {
    beneficiaryAge: 5,
    educationStartAge: 18,
    educationYears: 4,
    currentAnnualTuitionCents: 3_000_000, // $30,000/yr
    tuitionInflationBps: 500, // 5%
    currentBalanceCents: 2_000_000, // $20,000
    monthlyContributionCents: 50_000, // $500/mo
    annualReturnBps: 700, // 7%
    stateTaxRateBps: 500, // 5%
  };

  it('calculates total projected cost', () => {
    const result = analyzeEducationFund(baseParams);
    expect(result.totalProjectedCostCents).toBeGreaterThan(0);
  });

  it('projects balance growth', () => {
    const result = analyzeEducationFund(baseParams);
    expect(result.projectedBalanceCents).toBeGreaterThan(baseParams.currentBalanceCents);
  });

  it('calculates coverage ratio', () => {
    const result = analyzeEducationFund(baseParams);
    expect(result.coverageRatioBps).toBeGreaterThan(0);
    expect(result.coverageRatioBps).toBeLessThanOrEqual(10000);
  });

  it('calculates tax benefit', () => {
    const result = analyzeEducationFund(baseParams);
    // $500/mo × 12 = $6,000/yr × 5% = $300
    expect(result.annualTaxBenefitCents).toBe(30_000);
  });

  it('suggests an allocation', () => {
    const result = analyzeEducationFund(baseParams);
    // 13 years → growth-oriented
    expect(result.suggestedAllocation.equityPercent).toBe(70);
  });

  it('handles beneficiary already at education age', () => {
    const result = analyzeEducationFund({
      ...baseParams,
      beneficiaryAge: 18,
    });
    // Years to start = 0, so projected balance = current balance
    expect(result.projectedBalanceCents).toBe(baseParams.currentBalanceCents);
  });

  it('handles zero current balance', () => {
    const result = analyzeEducationFund({
      ...baseParams,
      currentBalanceCents: 0,
    });
    expect(result.fundingGapCents).toBeGreaterThanOrEqual(0);
    expect(result.requiredMonthlyContributionCents).toBeGreaterThan(0);
  });
});
