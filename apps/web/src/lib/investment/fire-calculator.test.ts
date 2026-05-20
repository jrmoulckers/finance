// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the FIRE (Financial Independence, Retire Early) calculator.
 *
 * Uses known financial test vectors.
 *
 * References: issues #1675, #1715
 */

import { describe, expect, it } from 'vitest';
import type { FIREInput } from './types';
import {
  calculateCoastFI,
  calculateFINumber,
  calculateFIPercent,
  calculateFIREMetrics,
  calculateSavingsRate,
  calculateYearsToFI,
} from './fire-calculator';

// ---------------------------------------------------------------------------
// calculateFINumber
// ---------------------------------------------------------------------------

describe('calculateFINumber', () => {
  it('calculates FI number at 4% SWR (25× rule)', () => {
    // $40,000 expenses × 25 = $1,000,000
    const fi = calculateFINumber(40000_00, 4);
    expect(fi).toBe(1000000_00);
  });

  it('calculates FI number at 3.5% SWR', () => {
    // $40,000 / 0.035 = ~$1,142,857
    const fi = calculateFINumber(40000_00, 3.5);
    expect(fi).toBeCloseTo(1142857_14, -2);
  });

  it('returns 0 for zero withdrawal rate', () => {
    expect(calculateFINumber(40000_00, 0)).toBe(0);
  });

  it('returns 0 for negative withdrawal rate', () => {
    expect(calculateFINumber(40000_00, -1)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateFIPercent
// ---------------------------------------------------------------------------

describe('calculateFIPercent', () => {
  it('returns 50% when halfway to FI', () => {
    expect(calculateFIPercent(500000_00, 1000000_00)).toBe(50);
  });

  it('returns 100% when at FI', () => {
    expect(calculateFIPercent(1000000_00, 1000000_00)).toBe(100);
  });

  it('returns >100% when over-saved', () => {
    expect(calculateFIPercent(1200000_00, 1000000_00)).toBe(120);
  });

  it('returns 0 for zero FI number', () => {
    expect(calculateFIPercent(500000_00, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateCoastFI
// ---------------------------------------------------------------------------

describe('calculateCoastFI', () => {
  it('calculates CoastFI correctly', () => {
    // Need $1M in 20 years at 7% return
    // CoastFI = $1,000,000 / (1.07)^20 = ~$258,419
    const coast = calculateCoastFI(1000000_00, 7, 20);
    expect(coast).toBeCloseTo(258419_00, -4);
  });

  it('returns FI number when years is 0', () => {
    expect(calculateCoastFI(1000000_00, 7, 0)).toBe(1000000_00);
  });

  it('returns FI number when years is negative', () => {
    expect(calculateCoastFI(1000000_00, 7, -5)).toBe(1000000_00);
  });

  it('CoastFI decreases with more years', () => {
    const coast10 = calculateCoastFI(1000000_00, 7, 10);
    const coast20 = calculateCoastFI(1000000_00, 7, 20);
    const coast30 = calculateCoastFI(1000000_00, 7, 30);
    expect(coast20).toBeLessThan(coast10);
    expect(coast30).toBeLessThan(coast20);
  });
});

// ---------------------------------------------------------------------------
// calculateSavingsRate
// ---------------------------------------------------------------------------

describe('calculateSavingsRate', () => {
  it('calculates savings rate correctly', () => {
    // $30,000 saved on $100,000 income = 30%
    expect(calculateSavingsRate(30000_00, 100000_00)).toBe(30);
  });

  it('returns 0 for zero income', () => {
    expect(calculateSavingsRate(30000_00, 0)).toBe(0);
  });

  it('handles 100% savings rate', () => {
    expect(calculateSavingsRate(100000_00, 100000_00)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// calculateYearsToFI
// ---------------------------------------------------------------------------

describe('calculateYearsToFI', () => {
  it('returns 0 when already at FI', () => {
    expect(calculateYearsToFI(1000000_00, 50000_00, 7, 1000000_00)).toBe(0);
  });

  it('returns 0 when over FI', () => {
    expect(calculateYearsToFI(1500000_00, 50000_00, 7, 1000000_00)).toBe(0);
  });

  it('calculates reasonable years to FI', () => {
    // $250k portfolio, $50k/yr savings, 7% return, $1M target
    const years = calculateYearsToFI(250000_00, 50000_00, 7, 1000000_00);
    expect(years).toBeGreaterThan(5);
    expect(years).toBeLessThan(20);
  });

  it('returns maxYears when savings are insufficient', () => {
    expect(calculateYearsToFI(0, 0, 0, 1000000_00)).toBe(100);
  });

  it('fewer years with higher savings rate', () => {
    const lowSave = calculateYearsToFI(0, 30000_00, 7, 1000000_00);
    const highSave = calculateYearsToFI(0, 60000_00, 7, 1000000_00);
    expect(highSave).toBeLessThan(lowSave);
  });
});

// ---------------------------------------------------------------------------
// calculateFIREMetrics (integration)
// ---------------------------------------------------------------------------

describe('calculateFIREMetrics', () => {
  const input: FIREInput = {
    currentPortfolioCents: 500000_00,
    annualExpensesCents: 40000_00,
    annualSavingsCents: 50000_00,
    annualIncomeCents: 120000_00,
    expectedReturnPercent: 7,
    currentAge: 35,
    targetRetirementAge: 55,
    withdrawalRatePercent: 4,
  };

  it('computes all FIRE metrics', () => {
    const metrics = calculateFIREMetrics(input);

    // FI number = $40,000 / 0.04 = $1,000,000
    expect(metrics.fiNumberCents).toBe(1000000_00);

    // FI% = $500,000 / $1,000,000 = 50%
    expect(metrics.fiPercent).toBe(50);

    // Savings rate = $50,000 / $120,000 = 41.67%
    expect(metrics.savingsRatePercent).toBeCloseTo(41.67, 1);

    // CoastFI should be less than FI number
    expect(metrics.coastFICents).toBeLessThan(metrics.fiNumberCents);

    // isCoastFI: $500k should exceed CoastFI for 20 years at 7%
    // CoastFI = $1M / (1.07)^20 ≈ $258,419
    expect(metrics.isCoastFI).toBe(true);

    // Years to FI should be reasonable
    expect(metrics.yearsToFI).toBeGreaterThan(0);
    expect(metrics.yearsToFI).toBeLessThan(20);

    // Current passive income = $500,000 × 0.04 = $20,000
    expect(metrics.currentPassiveIncomeCents).toBe(20000_00);

    // Income replacement = $20,000 / $40,000 = 50%
    expect(metrics.incomeReplacementPercent).toBe(50);

    // Projected FI date should be a valid date string
    expect(metrics.projectedFIDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('handles already-FI scenario', () => {
    const firedInput: FIREInput = {
      ...input,
      currentPortfolioCents: 1500000_00,
    };
    const metrics = calculateFIREMetrics(firedInput);
    expect(metrics.fiPercent).toBe(150);
    expect(metrics.yearsToFI).toBe(0);
    expect(metrics.incomeReplacementPercent).toBeGreaterThan(100);
  });
});
