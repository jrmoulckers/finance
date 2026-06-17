// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { generateSavingsNudges } from './nudgeEngine';

const suggestion = {
  id: 'discretionary',
  type: 'discretionary-savings' as const,
  title: 'Redirect dining into a flex savings bucket',
  reason: 'Dining is elevated',
  reasoning: [],
  priority: 'high' as const,
  targetCents: 120_000,
  currentCents: 0,
  shortfallCents: 120_000,
  targetDate: null,
  linkedGoalId: null,
  redirectCategoryNames: ['Dining Out'],
  contributionPlan: {
    recommendedFrequency: 'weekly' as const,
    recommendedMonthlyContributionCents: 20_000,
    minimumMonthlyContributionCents: 10_000,
    stretchMonthlyContributionCents: 30_000,
    estimatedMonths: 6,
    options: [],
  },
};

describe('nudgeEngine', () => {
  it('creates a contextual warning when weekly savings fall behind', () => {
    const nudges = generateSavingsNudges({
      currencyCode: 'USD',
      monthlySurplusCents: 40_000,
      currentWeeklySavingsCents: 10_000,
      previousWeeklySavingsCents: 20_000,
      topDiscretionaryCategory: {
        categoryId: 'dining',
        categoryName: 'Dining Out',
        monthlySpendCents: 80_000,
        previousMonthlySpendCents: 50_000,
        shareOfSpendingPercent: 20,
        essential: false,
      },
      suggestions: [
        suggestion,
        {
          ...suggestion,
          id: 'retirement',
          type: 'retirement' as const,
          title: 'Increase retirement contributions',
        },
      ],
    });

    expect(nudges[0]?.type).toBe('spending-drift');
    expect(nudges[0]?.message).toContain('redirect from dining out');
    expect(nudges.some((nudge) => nudge.type === 'retirement-gap')).toBe(true);
  });
});
