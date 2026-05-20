// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for home purchase readiness tracker.
 *
 * References: #1652, #1771
 */

import { describe, it, expect } from 'vitest';
import {
  calculateDownPayment,
  calculateClosingCosts,
  calculateMonthlyMortgage,
  calculateMonthlyPmi,
  calculateDti,
  calculateRequiredMonthlySavings,
  analyzeHomePurchase,
} from './home-purchase';
import type { HomePurchaseParams } from './types';

// ---------------------------------------------------------------------------
// calculateDownPayment
// ---------------------------------------------------------------------------

describe('calculateDownPayment', () => {
  it('calculates 20% down payment', () => {
    // $400,000 home × 20% = $80,000
    expect(calculateDownPayment(40_000_000, 2000)).toBe(8_000_000);
  });

  it('calculates 5% down payment', () => {
    // $300,000 home × 5% = $15,000
    expect(calculateDownPayment(30_000_000, 500)).toBe(1_500_000);
  });

  it('returns 0 for zero down payment', () => {
    expect(calculateDownPayment(40_000_000, 0)).toBe(0);
  });

  it('handles zero home price', () => {
    expect(calculateDownPayment(0, 2000)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateClosingCosts
// ---------------------------------------------------------------------------

describe('calculateClosingCosts', () => {
  it('defaults to 3% closing costs', () => {
    // $400,000 × 3% = $12,000
    expect(calculateClosingCosts(40_000_000)).toBe(1_200_000);
  });

  it('applies custom closing cost rate', () => {
    // $400,000 × 5% = $20,000
    expect(calculateClosingCosts(40_000_000, 500)).toBe(2_000_000);
  });

  it('handles 2% rate', () => {
    // $300,000 × 2% = $6,000
    expect(calculateClosingCosts(30_000_000, 200)).toBe(600_000);
  });
});

// ---------------------------------------------------------------------------
// calculateMonthlyMortgage
// ---------------------------------------------------------------------------

describe('calculateMonthlyMortgage', () => {
  it('calculates 30-year fixed mortgage payment', () => {
    // $320,000 loan at 7% for 30 years ≈ $2,129/mo
    const payment = calculateMonthlyMortgage(32_000_000, 700, 30);
    // Allow small rounding variance
    expect(payment).toBeGreaterThan(212_000);
    expect(payment).toBeLessThan(213_500);
  });

  it('calculates 15-year fixed mortgage payment', () => {
    // $320,000 at 6.5% for 15 years ≈ $2,789/mo
    const payment = calculateMonthlyMortgage(32_000_000, 650, 15);
    expect(payment).toBeGreaterThan(278_000);
    expect(payment).toBeLessThan(280_000);
  });

  it('returns 0 for zero loan amount', () => {
    expect(calculateMonthlyMortgage(0, 700, 30)).toBe(0);
  });

  it('handles zero interest rate (interest-free)', () => {
    // $240,000 / (30 × 12) = $666.67/mo ≈ 667 in cents
    const payment = calculateMonthlyMortgage(24_000_000, 0, 30);
    expect(payment).toBe(66667);
  });
});

// ---------------------------------------------------------------------------
// calculateMonthlyPmi
// ---------------------------------------------------------------------------

describe('calculateMonthlyPmi', () => {
  it('returns 0 when not required', () => {
    expect(calculateMonthlyPmi(32_000_000, false)).toBe(0);
  });

  it('calculates PMI at 0.80% annual rate', () => {
    // $320,000 loan × 0.80% / 12 ≈ $213.33/mo
    const pmi = calculateMonthlyPmi(32_000_000, true);
    expect(pmi).toBeGreaterThan(21_300);
    expect(pmi).toBeLessThan(21_400);
  });
});

// ---------------------------------------------------------------------------
// calculateDti
// ---------------------------------------------------------------------------

describe('calculateDti', () => {
  it('calculates correct DTI ratio', () => {
    // $2,000 debt / $7,000 income = 28.57% ≈ 2857 bps
    const dti = calculateDti(200_000, 700_000);
    expect(dti).toBe(2857);
  });

  it('returns 0 for zero income', () => {
    expect(calculateDti(200_000, 0)).toBe(0);
  });

  it('handles zero debt', () => {
    expect(calculateDti(0, 700_000)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateRequiredMonthlySavings
// ---------------------------------------------------------------------------

describe('calculateRequiredMonthlySavings', () => {
  it('returns null when target already met', () => {
    expect(calculateRequiredMonthlySavings(10_000_00, 15_000_00, 12)).toBeNull();
  });

  it('calculates monthly savings needed', () => {
    // $20,000 gap / 12 months ≈ $1,667
    const result = calculateRequiredMonthlySavings(30_000_00, 10_000_00, 12);
    expect(result).toBe(166_667);
  });

  it('returns full gap when months is 0', () => {
    expect(calculateRequiredMonthlySavings(20_000_00, 5_000_00, 0)).toBe(15_000_00);
  });
});

// ---------------------------------------------------------------------------
// analyzeHomePurchase — integration
// ---------------------------------------------------------------------------

describe('analyzeHomePurchase', () => {
  const baseParams: HomePurchaseParams = {
    homePriceCents: 40_000_000, // $400,000
    currentSavingsCents: 5_000_000, // $50,000
    monthlySavingsCents: 200_000, // $2,000/mo
    targetDate: '2026-06-01',
    mortgageRateBps: 700, // 7%
    loanTermYears: 30,
    propertyTaxRateBps: 120, // 1.2%
    annualInsuranceCents: 180_000, // $1,800/yr
    annualIncomeCents: 12_000_000, // $120,000/yr
    existingMonthlyDebtCents: 50_000, // $500/mo
    downPaymentBps: 2000, // 20%
  };
  const today = new Date('2025-01-01');

  it('identifies no PMI at 20% down', () => {
    const result = analyzeHomePurchase(baseParams, today);
    expect(result.pmiRequired).toBe(false);
    expect(result.monthlyPmiCents).toBe(0);
  });

  it('identifies PMI required at 10% down', () => {
    const result = analyzeHomePurchase({ ...baseParams, downPaymentBps: 1000 }, today);
    expect(result.pmiRequired).toBe(true);
    expect(result.monthlyPmiCents).toBeGreaterThan(0);
  });

  it('calculates correct total cash needed', () => {
    const result = analyzeHomePurchase(baseParams, today);
    // 20% of $400K = $80K + 3% closing = $12K = $92K total
    expect(result.downPaymentCents).toBe(8_000_000);
    expect(result.closingCostsCents).toBe(1_200_000);
    expect(result.totalCashNeededCents).toBe(9_200_000);
  });

  it('shows savings gap when under-saved', () => {
    const result = analyzeHomePurchase(baseParams, today);
    // Need $92K, have $50K → gap = $42K
    expect(result.savingsGapCents).toBe(4_200_000);
  });

  it('shows no gap when fully saved', () => {
    const result = analyzeHomePurchase({ ...baseParams, currentSavingsCents: 10_000_000 }, today);
    expect(result.savingsGapCents).toBe(0);
    expect(result.onTrack).toBe(true);
  });

  it('calculates DTI ratios', () => {
    const result = analyzeHomePurchase(baseParams, today);
    // Monthly income = $10,000
    // Housing cost should be reasonable fraction
    expect(result.frontEndDtiBps).toBeGreaterThan(0);
    expect(result.backEndDtiBps).toBeGreaterThan(result.frontEndDtiBps);
  });

  it('handles zero savings', () => {
    const result = analyzeHomePurchase({ ...baseParams, currentSavingsCents: 0 }, today);
    expect(result.savingsGapCents).toBe(result.totalCashNeededCents);
    expect(result.onTrack).toBe(false);
  });

  it('handles event in the past', () => {
    const result = analyzeHomePurchase({ ...baseParams, targetDate: '2024-01-01' }, today);
    // Should not crash; required savings should reflect urgency
    expect(result.requiredMonthlySavingsCents).not.toBeNull();
  });
});
