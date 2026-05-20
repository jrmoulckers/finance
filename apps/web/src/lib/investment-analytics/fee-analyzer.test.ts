// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for investment fee drag and 401(k) fee analyzer.
 *
 * References: issue #1702
 */

import { describe, expect, it } from 'vitest';
import {
  analyze401kFees,
  bpsToDollarsCents,
  compareFees,
  computeWeightedExpenseRatio,
  createFeeBreakdown,
  dollarsCentsToBps,
  projectFeeDragAnalytics,
  projectFeeDragMultiYear,
} from './fee-analyzer';

// ---------------------------------------------------------------------------
// createFeeBreakdown
// ---------------------------------------------------------------------------

describe('createFeeBreakdown', () => {
  it('creates a breakdown with all components', () => {
    const breakdown = createFeeBreakdown(50, 25, 100);
    expect(breakdown.expenseRatioBps).toBe(50);
    expect(breakdown.adminFeeBps).toBe(25);
    expect(breakdown.advisoryFeeBps).toBe(100);
    expect(breakdown.totalFeeBps).toBe(175);
  });

  it('defaults admin and advisory to 0', () => {
    const breakdown = createFeeBreakdown(30);
    expect(breakdown.adminFeeBps).toBe(0);
    expect(breakdown.advisoryFeeBps).toBe(0);
    expect(breakdown.totalFeeBps).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// bpsToDollarsCents / dollarsCentsToBps
// ---------------------------------------------------------------------------

describe('bpsToDollarsCents', () => {
  it('converts basis points to annual dollar cost', () => {
    // 100 bps (1%) on $100,000 = $1,000 = 100000 cents
    expect(bpsToDollarsCents(10000000, 100)).toBe(100000);
  });

  it('handles zero portfolio value', () => {
    expect(bpsToDollarsCents(0, 100)).toBe(0);
  });

  it('handles zero basis points', () => {
    expect(bpsToDollarsCents(10000000, 0)).toBe(0);
  });
});

describe('dollarsCentsToBps', () => {
  it('converts annual dollar cost to basis points', () => {
    // $1,000 (100000 cents) on $100,000 (10000000 cents) = 100 bps
    expect(dollarsCentsToBps(10000000, 100000)).toBe(100);
  });

  it('handles zero portfolio value', () => {
    expect(dollarsCentsToBps(0, 100000)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// projectFeeDragAnalytics
// ---------------------------------------------------------------------------

describe('projectFeeDragAnalytics', () => {
  it('projects values with compound growth', () => {
    // $10,000 at 7% for 10 years without fees
    const result = projectFeeDragAnalytics(1000000, 7, 0, 10);
    expect(result.valueWithoutFeesCents).toBe(result.valueWithFeesCents);
    expect(result.totalFeesPaidCents).toBe(0);
  });

  it('shows fee drag with non-zero fees', () => {
    // $10,000 at 7% with 100bps for 10 years
    const result = projectFeeDragAnalytics(1000000, 7, 100, 10);
    expect(result.valueWithFeesCents).toBeLessThan(result.valueWithoutFeesCents);
    expect(result.totalFeesPaidCents).toBeGreaterThan(0);
    expect(result.feeDragPercent).toBeGreaterThan(0);
  });

  it('handles zero initial value', () => {
    const result = projectFeeDragAnalytics(0, 7, 50, 10);
    expect(result.valueWithoutFeesCents).toBe(0);
    expect(result.valueWithFeesCents).toBe(0);
  });

  it('fee drag increases with higher fees', () => {
    const lowFee = projectFeeDragAnalytics(1000000, 7, 10, 30);
    const highFee = projectFeeDragAnalytics(1000000, 7, 100, 30);
    expect(highFee.totalFeesPaidCents).toBeGreaterThan(lowFee.totalFeesPaidCents);
  });
});

// ---------------------------------------------------------------------------
// projectFeeDragMultiYear
// ---------------------------------------------------------------------------

describe('projectFeeDragMultiYear', () => {
  it('generates projections for 10, 20, and 30 years', () => {
    const projections = projectFeeDragMultiYear(1000000, 7, 50);
    expect(projections).toHaveLength(3);
    expect(projections[0].years).toBe(10);
    expect(projections[1].years).toBe(20);
    expect(projections[2].years).toBe(30);
  });

  it('shows increasing fee drag over time', () => {
    const projections = projectFeeDragMultiYear(1000000, 7, 100);
    expect(projections[2].totalFeesPaidCents).toBeGreaterThan(projections[0].totalFeesPaidCents);
  });
});

// ---------------------------------------------------------------------------
// compareFees
// ---------------------------------------------------------------------------

describe('compareFees', () => {
  it('shows savings when switching to lower fees', () => {
    const comparison = compareFees(1000000, 7, 'Expensive Fund', 100, 'Index Fund', 10);
    expect(comparison.currentTotalBps).toBe(100);
    expect(comparison.alternativeTotalBps).toBe(10);
    expect(comparison.savingsAtYears).toHaveLength(3);

    for (const saving of comparison.savingsAtYears) {
      expect(saving.totalFeesPaidCents).toBeGreaterThan(0);
    }
  });

  it('shows negative savings when switching to higher fees', () => {
    const comparison = compareFees(1000000, 7, 'Index Fund', 10, 'Expensive Fund', 100);
    for (const saving of comparison.savingsAtYears) {
      expect(saving.totalFeesPaidCents).toBeLessThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// computeWeightedExpenseRatio
// ---------------------------------------------------------------------------

describe('computeWeightedExpenseRatio', () => {
  it('computes weighted average', () => {
    const holdings = [
      { marketValueCents: 50000_00, expenseRatioBps: 3 },
      { marketValueCents: 30000_00, expenseRatioBps: 7 },
      { marketValueCents: 20000_00, expenseRatioBps: 3 },
    ];
    // (5000000*3 + 3000000*7 + 2000000*3) / 10000000 = 4.2 → rounds to 4
    expect(computeWeightedExpenseRatio(holdings)).toBe(4);
  });

  it('returns 0 for empty holdings', () => {
    expect(computeWeightedExpenseRatio([])).toBe(0);
  });

  it('returns exact ratio for single holding', () => {
    const holdings = [{ marketValueCents: 100000_00, expenseRatioBps: 50 }];
    expect(computeWeightedExpenseRatio(holdings)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// analyze401kFees
// ---------------------------------------------------------------------------

describe('analyze401kFees', () => {
  it('produces complete analysis', () => {
    const result = analyze401kFees(1000000_00, 50, 25, 100, 7, [
      { label: 'Vanguard IRA', totalBps: 10 },
    ]);

    expect(result.breakdown.totalFeeBps).toBe(175);
    expect(result.projections).toHaveLength(3);
    expect(result.comparisons).toHaveLength(1);
    expect(result.totalAnnualFeesCents).toBeGreaterThan(0);
    expect(result.portfolioValueCents).toBe(1000000_00);
  });

  it('uses defaults for optional parameters', () => {
    const result = analyze401kFees(500000_00, 30);
    expect(result.breakdown.adminFeeBps).toBe(0);
    expect(result.breakdown.advisoryFeeBps).toBe(0);
    expect(result.comparisons).toHaveLength(0);
  });

  it('total annual fees match bps-to-dollars conversion', () => {
    const result = analyze401kFees(1000000_00, 100);
    // 100 bps (1%) on $10,000 (1000000 cents) = $100 = 1000000 * 100 / 10000 = 10000 cents... wait
    // 1000000_00 cents = $10,000. 100 bps = 1%. $10,000 * 1% = $100 = 10000 cents.
    // But bpsToDollarsCents(100000000, 100) = 100000000 * 100 / 10000 = 1000000
    expect(result.totalAnnualFeesCents).toBe(1000000);
  });
});
