// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the DRIP simulator and yield-on-cost calculator.
 *
 * Uses known financial test vectors with deterministic inputs.
 *
 * References: issue #1639
 */

import { describe, expect, it } from 'vitest';
import type { DRIPInput } from './types';
import { calculateYieldOnCost, projectPassiveIncome, simulateDRIP } from './drip-projections';

// ---------------------------------------------------------------------------
// calculateYieldOnCost
// ---------------------------------------------------------------------------

describe('calculateYieldOnCost', () => {
  it('computes yield on cost correctly', () => {
    // $2.00 annual dividend, $50.00 original cost = 4%
    const yoc = calculateYieldOnCost(200, 5000);
    expect(yoc).toBe(4);
  });

  it('returns 0 when cost is 0', () => {
    expect(calculateYieldOnCost(200, 0)).toBe(0);
  });

  it('returns 0 when cost is negative', () => {
    expect(calculateYieldOnCost(200, -100)).toBe(0);
  });

  it('handles large yield on cost', () => {
    // $10 dividend on $20 cost = 50%
    const yoc = calculateYieldOnCost(1000, 2000);
    expect(yoc).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// simulateDRIP
// ---------------------------------------------------------------------------

describe('simulateDRIP', () => {
  const baseInput: DRIPInput = {
    initialShares: 100,
    sharePriceCents: 100_00, // $100
    annualDividendPerShareCents: 400, // $4.00
    dividendGrowthRatePercent: 5, // 5% annual dividend growth
    priceAppreciationPercent: 7, // 7% annual price growth
    years: 10,
  };

  it('produces correct number of year results', () => {
    const result = simulateDRIP(baseInput);
    expect(result.yearResults).toHaveLength(10);
  });

  it('starts with initial shares in year 1', () => {
    const result = simulateDRIP(baseInput);
    const year1 = result.yearResults[0];

    // Year 1: 100 shares × $4.00 = $400 dividend
    expect(year1.totalDividendCents).toBe(40000);
    // DRIP: $400 / $100 = 4 new shares
    expect(year1.newSharesFromDrip).toBe(4);
    expect(year1.totalShares).toBe(104);
  });

  it('shows increasing share count over time', () => {
    const result = simulateDRIP(baseInput);
    for (let i = 1; i < result.yearResults.length; i++) {
      expect(result.yearResults[i].totalShares).toBeGreaterThan(
        result.yearResults[i - 1].totalShares,
      );
    }
  });

  it('shows increasing yield on cost over time', () => {
    const result = simulateDRIP(baseInput);
    for (let i = 1; i < result.yearResults.length; i++) {
      expect(result.yearResults[i].yieldOnCostPercent).toBeGreaterThan(
        result.yearResults[i - 1].yieldOnCostPercent,
      );
    }
  });

  it('tracks cumulative dividends correctly', () => {
    const result = simulateDRIP(baseInput);
    let cumulative = 0;
    for (const yr of result.yearResults) {
      cumulative += yr.totalDividendCents;
      expect(yr.cumulativeDividendsCents).toBe(cumulative);
    }
  });

  it('final values match last year result', () => {
    const result = simulateDRIP(baseInput);
    const lastYear = result.yearResults[result.yearResults.length - 1];
    expect(result.finalValueCents).toBe(lastYear.portfolioValueCents);
    expect(result.finalShares).toBe(lastYear.totalShares);
    expect(result.finalYieldOnCostPercent).toBe(lastYear.yieldOnCostPercent);
  });

  it('returns empty results for zero years', () => {
    const result = simulateDRIP({ ...baseInput, years: 0 });
    expect(result.yearResults).toHaveLength(0);
    expect(result.finalValueCents).toBe(100 * 100_00);
  });

  it('returns empty results for zero shares', () => {
    const result = simulateDRIP({ ...baseInput, initialShares: 0 });
    expect(result.yearResults).toHaveLength(0);
    expect(result.finalValueCents).toBe(0);
  });

  it('portfolio value grows with compound reinvestment', () => {
    const result = simulateDRIP(baseInput);
    const initialValue = baseInput.initialShares * baseInput.sharePriceCents;
    expect(result.finalValueCents).toBeGreaterThan(initialValue);
  });
});

// ---------------------------------------------------------------------------
// projectPassiveIncome
// ---------------------------------------------------------------------------

describe('projectPassiveIncome', () => {
  it('projects income without DRIP', () => {
    const income = projectPassiveIncome(
      100, // shares
      400, // $4.00/share annual dividend
      5, // 5% growth
      100_00, // $100 price
      7, // 7% appreciation
      5,
      false,
    );

    expect(income).toHaveLength(5);
    // Year 1: 100 × $4.00 = $400
    expect(income[0]).toBe(40000);
    // Each year should grow by ~5%
    for (let i = 1; i < income.length; i++) {
      expect(income[i]).toBeGreaterThan(income[i - 1]);
    }
  });

  it('projects higher income with DRIP enabled', () => {
    const withoutDrip = projectPassiveIncome(100, 400, 5, 100_00, 7, 10, false);
    const withDrip = projectPassiveIncome(100, 400, 5, 100_00, 7, 10, true);

    // DRIP should produce higher income by year 10 due to more shares
    expect(withDrip[9]).toBeGreaterThan(withoutDrip[9]);
  });

  it('returns correct length', () => {
    const income = projectPassiveIncome(100, 400, 5, 100_00, 7, 20, true);
    expect(income).toHaveLength(20);
  });
});
