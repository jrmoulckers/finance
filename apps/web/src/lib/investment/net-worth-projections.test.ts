// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { deriveProjectionScenarios, projectNetWorthGrowth } from './net-worth-projections';

describe('projectNetWorthGrowth', () => {
  it('projects assets, debt payoff, and milestone timing', () => {
    const [base] = projectNetWorthGrowth(
      {
        currentAssetsCents: 10_000_00,
        currentLiabilitiesCents: 5_000_00,
        monthlyContributionCents: 1_000_00,
        monthlyDebtPaymentCents: 500_00,
        annualAssetReturnPercent: 6,
        annualInflationPercent: 0,
        horizonMonths: 12,
        startMonth: '2025-01',
        milestones: [{ id: 'ten-k', label: 'First $10K', thresholdCents: 10_000_00 }],
      },
      [{ id: 'base', label: 'Base', annualReturnPercent: 6 }],
    );

    expect(base.points).toHaveLength(13);
    expect(base.points[0]?.netWorthCents).toBe(5_000_00);
    expect(base.points.at(-1)?.liabilitiesCents).toBe(0);
    expect(base.points.at(-1)?.netWorthCents).toBeGreaterThan(20_000_00);
    expect(base.milestones[0]?.reachable).toBe(true);
    expect(base.milestones[0]?.reachedLabel).toMatch(/^2025-/);
  });

  it('handles negative net worth and zero contributions', () => {
    const [base] = projectNetWorthGrowth(
      {
        currentAssetsCents: 1_000_00,
        currentLiabilitiesCents: 10_000_00,
        monthlyContributionCents: 0,
        monthlyDebtPaymentCents: 0,
        annualAssetReturnPercent: 0,
        annualInflationPercent: 0,
        horizonMonths: 3,
        startMonth: '2025-01',
      },
      [{ id: 'base', label: 'Base', annualReturnPercent: 0 }],
    );

    expect(base.points.every((point) => point.netWorthCents === -9_000_00)).toBe(true);
  });

  it('reports inflation-adjusted real net worth below nominal when inflation is positive', () => {
    const [base] = projectNetWorthGrowth(
      {
        currentAssetsCents: 10_000_00,
        currentLiabilitiesCents: 0,
        monthlyContributionCents: 0,
        monthlyDebtPaymentCents: 0,
        annualAssetReturnPercent: 0,
        annualInflationPercent: 6,
        horizonMonths: 12,
        startMonth: '2025-01',
      },
      [{ id: 'base', label: 'Base', annualReturnPercent: 0 }],
    );

    const final = base.points.at(-1);
    expect(final?.netWorthCents).toBe(10_000_00);
    expect(final?.realNetWorthCents).toBeLessThan(10_000_00);
  });
});

describe('deriveProjectionScenarios', () => {
  it('creates conservative, base, and optimistic return assumptions', () => {
    expect(deriveProjectionScenarios(6).map((scenario) => scenario.annualReturnPercent)).toEqual([
      4, 6, 8,
    ]);
  });
});
