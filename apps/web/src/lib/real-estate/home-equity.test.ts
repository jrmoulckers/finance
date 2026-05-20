// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the home equity calculation engine.
 *
 * Covers equity calculation, LTV, appreciation rate, property appreciation,
 * equity growth projection, and banker's rounding.
 *
 * References: issue #1678
 */

import { describe, expect, it } from 'vitest';
import type { MortgageDetails, Property } from './types';
import {
  bankersRound,
  calculateAppreciationRate,
  calculateHomeEquity,
  calculateHomeEquityFromProperty,
  calculatePropertyAppreciation,
  projectEquityGrowth,
} from './home-equity';

// ---------------------------------------------------------------------------
// bankersRound
// ---------------------------------------------------------------------------

describe('bankersRound', () => {
  it('rounds down when fractional part < 0.5', () => {
    expect(bankersRound(2.3)).toBe(2);
    expect(bankersRound(10.49)).toBe(10);
  });

  it('rounds up when fractional part > 0.5', () => {
    expect(bankersRound(2.7)).toBe(3);
    expect(bankersRound(10.51)).toBe(11);
  });

  it('rounds to even when fractional part is exactly 0.5 (even floor)', () => {
    expect(bankersRound(2.5)).toBe(2);
    expect(bankersRound(4.5)).toBe(4);
  });

  it('rounds to even when fractional part is exactly 0.5 (odd floor)', () => {
    expect(bankersRound(3.5)).toBe(4);
    expect(bankersRound(5.5)).toBe(6);
  });

  it('handles negative numbers', () => {
    expect(bankersRound(-2.3)).toBe(-2);
    expect(bankersRound(-2.7)).toBe(-3);
  });

  it('handles zero', () => {
    expect(bankersRound(0)).toBe(0);
    expect(bankersRound(0.5)).toBe(0); // 0 is even
  });
});

// ---------------------------------------------------------------------------
// calculateHomeEquity
// ---------------------------------------------------------------------------

describe('calculateHomeEquity', () => {
  it('calculates equity as value minus balance', () => {
    const result = calculateHomeEquity(30000000, 20000000); // $300k value, $200k balance
    expect(result.equityCents).toBe(10000000); // $100k equity
  });

  it('calculates LTV ratio correctly', () => {
    const result = calculateHomeEquity(30000000, 24000000); // $300k value, $240k balance
    expect(result.ltvPercent).toBe(80);
  });

  it('calculates equity percentage correctly', () => {
    const result = calculateHomeEquity(40000000, 10000000); // $400k value, $100k balance
    expect(result.equityPercent).toBe(75);
  });

  it('handles negative equity (underwater)', () => {
    const result = calculateHomeEquity(20000000, 25000000); // $200k value, $250k balance
    expect(result.equityCents).toBe(-5000000);
    expect(result.ltvPercent).toBe(125);
  });

  it('handles zero property value', () => {
    const result = calculateHomeEquity(0, 20000000);
    expect(result.ltvPercent).toBe(0);
    expect(result.equityPercent).toBe(0);
  });

  it('handles fully paid mortgage', () => {
    const result = calculateHomeEquity(30000000, 0);
    expect(result.equityCents).toBe(30000000);
    expect(result.ltvPercent).toBe(0);
    expect(result.equityPercent).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// calculateHomeEquityFromProperty
// ---------------------------------------------------------------------------

describe('calculateHomeEquityFromProperty', () => {
  it('delegates to calculateHomeEquity with correct values', () => {
    const property: Property = {
      id: 'p1',
      name: '123 Main St',
      purchasePriceCents: 25000000,
      purchaseDate: '2020-01-01',
      currentValueCents: 30000000,
      valuationDate: '2025-01-01',
    };

    const mortgage: MortgageDetails = {
      originalLoanCents: 20000000,
      currentBalanceCents: 18000000,
      annualRateBps: 650,
      termMonths: 360,
      monthlyPaymentCents: 126473,
      paymentsMade: 60,
      hasPMI: false,
      monthlyPMICents: 0,
    };

    const result = calculateHomeEquityFromProperty(property, mortgage);
    expect(result.propertyValueCents).toBe(30000000);
    expect(result.mortgageBalanceCents).toBe(18000000);
    expect(result.equityCents).toBe(12000000);
  });
});

// ---------------------------------------------------------------------------
// calculateAppreciationRate
// ---------------------------------------------------------------------------

describe('calculateAppreciationRate', () => {
  it('calculates CAGR for a simple appreciation', () => {
    // $200k → $300k over 5 years ≈ 8.45% CAGR
    const rate = calculateAppreciationRate(20000000, 30000000, 5);
    expect(rate).toBeGreaterThan(8);
    expect(rate).toBeLessThan(9);
  });

  it('returns 0 for zero start value', () => {
    expect(calculateAppreciationRate(0, 30000000, 5)).toBe(0);
  });

  it('returns 0 for zero years', () => {
    expect(calculateAppreciationRate(20000000, 30000000, 0)).toBe(0);
  });

  it('returns negative rate for depreciation', () => {
    const rate = calculateAppreciationRate(30000000, 20000000, 5);
    expect(rate).toBeLessThan(0);
  });

  it('returns 0 for negative start value', () => {
    expect(calculateAppreciationRate(-10000, 30000000, 5)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculatePropertyAppreciation
// ---------------------------------------------------------------------------

describe('calculatePropertyAppreciation', () => {
  it('calculates appreciation from purchase to current value', () => {
    const property: Property = {
      id: 'p1',
      name: 'Test Property',
      purchasePriceCents: 20000000, // $200k
      purchaseDate: '2020-01-01',
      currentValueCents: 26000000, // $260k
      valuationDate: '2025-01-01',
    };

    const rate = calculatePropertyAppreciation(property);
    // ~5.39% CAGR over ~5 years
    expect(rate).toBeGreaterThan(5);
    expect(rate).toBeLessThan(6);
  });
});

// ---------------------------------------------------------------------------
// projectEquityGrowth
// ---------------------------------------------------------------------------

describe('projectEquityGrowth', () => {
  it('returns initial snapshot plus monthly projections', () => {
    const snapshots = projectEquityGrowth(
      30000000, // $300k value
      24000000, // $240k balance
      126473, // ~$1264/mo
      650, // 6.5% rate
      3, // 3% annual appreciation
      12, // 12 months
    );

    expect(snapshots).toHaveLength(13); // 0 + 12 months
    expect(snapshots[0].month).toBe(0);
    expect(snapshots[0].propertyValueCents).toBe(30000000);
    expect(snapshots[0].mortgageBalanceCents).toBe(24000000);
  });

  it('shows mortgage balance decreasing over time', () => {
    // Use a payment that comfortably exceeds interest to ensure balance decreases
    // $240k at 6.5% → monthly interest ≈ $1,300; payment must exceed this
    const snapshots = projectEquityGrowth(30000000, 24000000, 200000, 650, 0, 12);

    for (let i = 1; i < snapshots.length; i++) {
      expect(snapshots[i].mortgageBalanceCents).toBeLessThanOrEqual(
        snapshots[i - 1].mortgageBalanceCents,
      );
    }
  });

  it('shows equity increasing over time', () => {
    const snapshots = projectEquityGrowth(30000000, 24000000, 126473, 650, 3, 12);

    for (let i = 1; i < snapshots.length; i++) {
      expect(snapshots[i].equityCents).toBeGreaterThanOrEqual(snapshots[i - 1].equityCents);
    }
  });

  it('handles zero appreciation', () => {
    const snapshots = projectEquityGrowth(30000000, 24000000, 126473, 650, 0, 6);

    // Property value should stay roughly the same (banker's rounding may cause ±1)
    for (const snap of snapshots) {
      expect(Math.abs(snap.propertyValueCents - 30000000)).toBeLessThanOrEqual(1);
    }
  });

  it('handles zero months', () => {
    const snapshots = projectEquityGrowth(30000000, 24000000, 126473, 650, 3, 0);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].month).toBe(0);
  });
});
