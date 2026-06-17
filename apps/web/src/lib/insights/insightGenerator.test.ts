// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { generatePersonalizedInsights } from './insightGenerator';
import type { WealthDigest } from './types';

function makeDigest(overrides: Partial<WealthDigest> = {}): WealthDigest {
  return {
    period: 'weekly',
    currencyCode: 'USD',
    generatedAt: '2025-01-20T12:00:00.000Z',
    netWorth: {
      current: 250_000,
      previous: 200_000,
      assets: 300_000,
      liabilities: 50_000,
      change: { amount: 50_000, percent: 25, direction: 'up' },
      history: [],
    },
    spending: {
      totalCurrentSpending: 70_000,
      totalPreviousSpending: 50_000,
      change: { amount: 20_000, percent: 40, direction: 'up' },
      topCategories: [
        {
          categoryId: 'food',
          categoryName: 'Food',
          currentAmount: 30_000,
          previousAmount: 20_000,
          shareOfSpending: 43,
          change: { amount: 10_000, percent: 50, direction: 'up' },
        },
      ],
    },
    savingsRate: {
      currentRate: 8,
      previousRate: 15,
      rateChangePoints: -7,
      change: { amount: -7, percent: -46.7, direction: 'down' },
      currentIncome: 100_000,
      currentSpending: 92_000,
      currentSavings: 8_000,
      history: [],
    },
    goals: [
      {
        id: 'goal-1',
        name: 'Emergency fund',
        status: 'ACTIVE',
        progressPercent: 85,
        targetAmount: 100_000,
        currentAmount: 85_000,
        remainingAmount: 15_000,
        targetDate: '2025-06-01',
        pace: 'on-track',
        monthlyContributionNeeded: 5_000,
      },
    ],
    healthScore: {
      score: 62,
      label: 'Stable',
      breakdown: {
        savingsRate: 8,
        budgetAdherence: 18,
        emergencyFund: 10,
        debtToIncome: 15,
      },
      metrics: {
        savingsRate: 8,
        onTrackBudgetRatio: 0.72,
        monthsOfExpensesSaved: 2,
        debtToIncomeRatio: 18,
      },
    },
    alignmentSnapshot: {
      categories: [],
      totalInputAmount: 0,
      totalMappedAmount: 0,
      unmappedAmount: 0,
    },
    highlights: [],
    ...overrides,
  };
}

describe('generatePersonalizedInsights', () => {
  it('surfaces actionable insights for wealth growth, spending, and goals', () => {
    const insights = generatePersonalizedInsights(makeDigest());

    expect(insights).toHaveLength(4);
    expect(insights.map((insight) => insight.id)).toEqual([
      'net-worth-growth',
      'top-category-spike',
      'low-savings-rate',
      'goal-nearly-complete-goal-1',
    ]);
  });

  it('falls back to a steady-progress insight when no stronger signals exist', () => {
    const insights = generatePersonalizedInsights(
      makeDigest({
        netWorth: {
          current: 0,
          previous: 0,
          assets: 0,
          liabilities: 0,
          change: { amount: 0, percent: 0, direction: 'flat' },
          history: [],
        },
        spending: {
          totalCurrentSpending: 0,
          totalPreviousSpending: 0,
          change: { amount: 0, percent: 0, direction: 'flat' },
          topCategories: [],
        },
        savingsRate: {
          currentRate: 12,
          previousRate: 12,
          rateChangePoints: 0,
          change: { amount: 0, percent: 0, direction: 'flat' },
          currentIncome: 0,
          currentSpending: 0,
          currentSavings: 0,
          history: [],
        },
        goals: [],
        healthScore: {
          score: 80,
          label: 'Strong',
          breakdown: {
            savingsRate: 15,
            budgetAdherence: 25,
            emergencyFund: 25,
            debtToIncome: 15,
          },
          metrics: {
            savingsRate: 12,
            onTrackBudgetRatio: 1,
            monthsOfExpensesSaved: 6,
            debtToIncomeRatio: 20,
          },
        },
      }),
    );

    expect(insights).toHaveLength(1);
    expect(insights[0]?.id).toBe('steady-progress');
  });
});
