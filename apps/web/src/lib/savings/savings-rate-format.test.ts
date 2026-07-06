// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import {
  SAVINGS_RATE_DECIMAL_PLACES,
  computeSavingsRatePercent,
  roundSavingsRatePercent,
} from './savings-rate-format';
import { calculateRate } from '../insights/helpers';
import { buildSavingsRateDashboardSummary } from '../dashboard/savings-rate-summary';

describe('roundSavingsRatePercent', () => {
  it('rounds to a single decimal place', () => {
    expect(SAVINGS_RATE_DECIMAL_PLACES).toBe(1);
    expect(roundSavingsRatePercent(54.72)).toBe(54.7);
    expect(roundSavingsRatePercent(54.75)).toBe(54.8);
    expect(roundSavingsRatePercent(55)).toBe(55);
  });
});

describe('computeSavingsRatePercent', () => {
  it('computes a one-decimal rate from income and spend', () => {
    // (100000 - 45280) / 100000 = 54.72% -> 54.7%
    expect(computeSavingsRatePercent(100_000, 45_280)).toBe(54.7);
  });

  it('returns 0 when there is no income', () => {
    expect(computeSavingsRatePercent(0, 100)).toBe(0);
    expect(computeSavingsRatePercent(-50, 100)).toBe(0);
  });

  it('allows a negative rate when overspending', () => {
    expect(computeSavingsRatePercent(100, 150)).toBe(-50);
  });
});

describe('savings-rate precision is consistent across surfaces', () => {
  it('insights calculateRate and the dashboard summary agree for identical income/spend', () => {
    const incomeCents = 100_000;
    const expenseCents = 45_280;

    const insightsRate = calculateRate(incomeCents, expenseCents);
    const dashboard = buildSavingsRateDashboardSummary(
      [{ month: '2025-01', incomeCents, expenseCents }],
      '2025-01',
    );

    const expected = computeSavingsRatePercent(incomeCents, expenseCents);
    expect(insightsRate).toBe(expected);
    expect(dashboard.current?.savingsRatePercent).toBe(expected);
    // The regression this guards: 54.7 vs 54.72 vs 55 on different screens.
    expect(insightsRate).toBe(dashboard.current?.savingsRatePercent);
  });
});
