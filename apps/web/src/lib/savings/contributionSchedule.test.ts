// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  buildContributionOptions,
  calculateContributionPlan,
  getContributionAmountForFrequency,
} from './contributionSchedule';

describe('contributionSchedule', () => {
  it('builds a contribution plan within the available capacity', () => {
    const plan = calculateContributionPlan({
      targetCents: 500_000,
      currentCents: 50_000,
      monthlyCapacityCents: 30_000,
      desiredMonthlyContributionCents: 25_000,
    });

    expect(plan.recommendedMonthlyContributionCents).toBe(25_000);
    expect(plan.estimatedMonths).toBe(18);
    expect(plan.recommendedFrequency).toBe('weekly');
  });

  it('derives cadence amounts from the monthly equivalent', () => {
    expect(getContributionAmountForFrequency(60_000, 'weekly')).toBeLessThan(
      getContributionAmountForFrequency(60_000, 'monthly'),
    );

    const options = buildContributionOptions(60_000, 120_000);
    expect(options).toHaveLength(3);
    expect(options[0]?.percentOfSurplus).toBe(50);
  });
});
