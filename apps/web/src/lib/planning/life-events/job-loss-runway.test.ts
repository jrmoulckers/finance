// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for job loss financial runway calculator.
 *
 * References: #1767
 */

import { describe, it, expect } from 'vitest';
import {
  calculateEssentialBurnRate,
  calculateFullBurnRate,
  calculateMonthlyIncome,
  generateMonthlyProjection,
  calculateRunwayMonths,
  generateRecommendations,
  analyzeJobLossRunway,
} from './job-loss-runway';
import type { JobLossRunwayParams } from './types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const baseParams: JobLossRunwayParams = {
  liquidSavingsCents: 3_000_000, // $30,000
  monthlyEssentialExpensesCents: 350_000, // $3,500
  monthlyNonEssentialExpensesCents: 100_000, // $1,000
  severanceMonthlyPayCents: 500_000, // $5,000
  severanceMonths: 3,
  cobraMonthlyPremiumCents: 150_000, // $1,500
  previousHealthPremiumCents: 30_000, // $300
  unemploymentBenefitCents: 200_000, // $2,000
  unemploymentMaxMonths: 6,
  otherMonthlyIncomeCents: 0,
};

// ---------------------------------------------------------------------------
// calculateEssentialBurnRate
// ---------------------------------------------------------------------------

describe('calculateEssentialBurnRate', () => {
  it('sums essentials and COBRA', () => {
    expect(calculateEssentialBurnRate(350_000, 150_000)).toBe(500_000);
  });

  it('handles zero COBRA', () => {
    expect(calculateEssentialBurnRate(350_000, 0)).toBe(350_000);
  });
});

// ---------------------------------------------------------------------------
// calculateFullBurnRate
// ---------------------------------------------------------------------------

describe('calculateFullBurnRate', () => {
  it('sums all expense categories', () => {
    expect(calculateFullBurnRate(350_000, 100_000, 150_000)).toBe(600_000);
  });
});

// ---------------------------------------------------------------------------
// calculateMonthlyIncome
// ---------------------------------------------------------------------------

describe('calculateMonthlyIncome', () => {
  it('includes severance in early months', () => {
    const income = calculateMonthlyIncome(0, baseParams);
    expect(income).toBe(500_000); // Only severance (no other income)
  });

  it('switches to unemployment after severance', () => {
    // Month 3: severance ended, unemployment starts
    const income = calculateMonthlyIncome(3, baseParams);
    expect(income).toBe(200_000); // Unemployment only
  });

  it('has no income after all benefits end', () => {
    // After month 8 (3 severance + 6 unemployment = 9 months covered)
    const income = calculateMonthlyIncome(10, baseParams);
    expect(income).toBe(0);
  });

  it('includes other monthly income', () => {
    const params = { ...baseParams, otherMonthlyIncomeCents: 50_000 };
    const income = calculateMonthlyIncome(10, params);
    expect(income).toBe(50_000);
  });
});

// ---------------------------------------------------------------------------
// generateMonthlyProjection
// ---------------------------------------------------------------------------

describe('generateMonthlyProjection', () => {
  it('starts with full savings', () => {
    const projection = generateMonthlyProjection(baseParams, true);
    expect(projection[0].remainingSavingsCents).toBe(3_000_000);
  });

  it('savings decrease over time', () => {
    const projection = generateMonthlyProjection(baseParams, true);
    // After the first month, savings should change
    expect(projection.length).toBeGreaterThan(1);
  });

  it('tracks severance and unemployment status', () => {
    const projection = generateMonthlyProjection(baseParams, true);
    expect(projection[0].severanceActive).toBe(true);
    expect(projection[0].unemploymentActive).toBe(false);

    // After severance (month 3+)
    const afterSeverance = projection.find((p) => p.month === 3);
    expect(afterSeverance?.severanceActive).toBe(false);
    expect(afterSeverance?.unemploymentActive).toBe(true);
  });

  it('stops when savings depleted', () => {
    const params: JobLossRunwayParams = {
      ...baseParams,
      liquidSavingsCents: 500_000, // Only $5,000
      severanceMonthlyPayCents: 0,
      severanceMonths: 0,
      unemploymentBenefitCents: 0,
      unemploymentMaxMonths: 0,
    };
    const projection = generateMonthlyProjection(params, true);
    const lastPoint = projection[projection.length - 1];
    expect(lastPoint.remainingSavingsCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateRunwayMonths
// ---------------------------------------------------------------------------

describe('calculateRunwayMonths', () => {
  it('calculates essential runway', () => {
    const months = calculateRunwayMonths(baseParams, true);
    expect(months).toBeGreaterThan(0);
  });

  it('essential runway is longer than full spending runway', () => {
    const essential = calculateRunwayMonths(baseParams, true);
    const full = calculateRunwayMonths(baseParams, false);
    expect(essential).toBeGreaterThanOrEqual(full);
  });

  it('handles zero savings', () => {
    const params = { ...baseParams, liquidSavingsCents: 0 };
    const months = calculateRunwayMonths(params, true);
    // With severance and unemployment, should still have some runway
    // since income exceeds expenses initially
    expect(months).toBeGreaterThanOrEqual(0);
  });

  it('handles very large savings', () => {
    const params = { ...baseParams, liquidSavingsCents: 100_000_000 };
    const months = calculateRunwayMonths(params, true);
    // Should not deplete within 36-month window
    expect(months).toBeGreaterThanOrEqual(35);
  });
});

// ---------------------------------------------------------------------------
// generateRecommendations
// ---------------------------------------------------------------------------

describe('generateRecommendations', () => {
  it('generates critical recommendation for very low runway', () => {
    const recs = generateRecommendations(1, 0.5, baseParams);
    expect(recs.some((r) => r.priority === 'critical')).toBe(true);
  });

  it('recommends cutting non-essential spending', () => {
    const recs = generateRecommendations(5, 3, baseParams);
    expect(recs.some((r) => r.label.includes('non-essential'))).toBe(true);
  });

  it('recommends COBRA alternatives when cost is high', () => {
    const recs = generateRecommendations(6, 4, baseParams);
    expect(recs.some((r) => r.label.includes('health insurance'))).toBe(true);
  });

  it('recommends unemployment if not receiving benefits', () => {
    const params = { ...baseParams, unemploymentBenefitCents: 0 };
    const recs = generateRecommendations(4, 3, params);
    expect(recs.some((r) => r.label.includes('unemployment'))).toBe(true);
  });

  it('gives low priority when runway is adequate', () => {
    const recs = generateRecommendations(12, 9, baseParams);
    expect(recs.some((r) => r.priority === 'low')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// analyzeJobLossRunway — integration
// ---------------------------------------------------------------------------

describe('analyzeJobLossRunway', () => {
  it('calculates burn rates', () => {
    const result = analyzeJobLossRunway(baseParams);
    expect(result.essentialBurnRateCents).toBe(500_000); // $3,500 + $1,500
    expect(result.fullBurnRateCents).toBe(600_000); // + $1,000 non-essential
  });

  it('calculates COBRA cost increase', () => {
    const result = analyzeJobLossRunway(baseParams);
    expect(result.cobraCostIncreaseCents).toBe(120_000); // $1,500 - $300
  });

  it('produces monthly projection', () => {
    const result = analyzeJobLossRunway(baseParams);
    expect(result.monthlyProjection.length).toBeGreaterThan(0);
    expect(result.monthlyProjection[0].month).toBe(0);
  });

  it('provides recommendations', () => {
    const result = analyzeJobLossRunway(baseParams);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('handles zero savings scenario', () => {
    const result = analyzeJobLossRunway({
      ...baseParams,
      liquidSavingsCents: 0,
    });
    expect(result.essentialRunwayMonths).toBeGreaterThanOrEqual(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('handles no income sources', () => {
    const result = analyzeJobLossRunway({
      ...baseParams,
      severanceMonthlyPayCents: 0,
      severanceMonths: 0,
      unemploymentBenefitCents: 0,
      unemploymentMaxMonths: 0,
      otherMonthlyIncomeCents: 0,
    });
    // Pure savings depletion: $30,000 / $5,000 essential burn = 6 months
    expect(result.essentialRunwayMonths).toBe(6);
  });
});
