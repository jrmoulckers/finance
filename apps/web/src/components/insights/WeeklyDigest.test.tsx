// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import type { WealthDigest } from '../../lib/insights';
import { WeeklyDigest } from './WeeklyDigest';

function makeDigest(): WealthDigest {
  return {
    period: 'weekly',
    currencyCode: 'USD',
    generatedAt: '2025-01-20T12:00:00.000Z',
    netWorth: {
      current: 250_000,
      previous: 225_000,
      assets: 300_000,
      liabilities: 50_000,
      change: { amount: 25_000, percent: 11.1, direction: 'up' },
      history: [],
    },
    spending: {
      totalCurrentSpending: 60_000,
      totalPreviousSpending: 50_000,
      change: { amount: 10_000, percent: 20, direction: 'up' },
      topCategories: [
        {
          categoryId: 'food',
          categoryName: 'Food',
          currentAmount: 25_000,
          previousAmount: 18_000,
          shareOfSpending: 42,
          change: { amount: 7_000, percent: 38.9, direction: 'up' },
        },
      ],
    },
    savingsRate: {
      currentRate: 22,
      previousRate: 18,
      rateChangePoints: 4,
      change: { amount: 4, percent: 22.2, direction: 'up' },
      currentIncome: 120_000,
      currentSpending: 60_000,
      currentSavings: 60_000,
      history: [],
    },
    goals: [],
    healthScore: {
      score: 82,
      label: 'Strong',
      breakdown: {
        savingsRate: 25,
        budgetAdherence: 20,
        emergencyFund: 17.5,
        debtToIncome: 20,
      },
      metrics: {
        savingsRate: 22,
        onTrackBudgetRatio: 0.8,
        monthsOfExpensesSaved: 3.5,
        debtToIncomeRatio: 19,
      },
    },
    alignmentSnapshot: {
      categories: [
        {
          categoryId: 'savings',
          categoryName: 'Savings & investing',
          amount: 60_000,
          source: 'savings',
          allocations: [
            { valueId: 'security', weight: 0.6 },
            { valueId: 'freedom', weight: 0.25 },
            { valueId: 'growth', weight: 0.15 },
          ],
        },
        {
          categoryId: 'groceries',
          categoryName: 'Groceries',
          amount: 24_000,
          source: 'expense',
          allocations: [
            { valueId: 'health', weight: 0.55 },
            { valueId: 'family', weight: 0.45 },
          ],
        },
      ],
      totalInputAmount: 84_000,
      totalMappedAmount: 84_000,
      unmappedAmount: 0,
    },
    highlights: [
      {
        id: 'net-worth-growth',
        title: 'Your net worth moved in the right direction',
        description:
          '11.1% week-over-week growth suggests your current habits are compounding well.',
        tone: 'success',
        icon: 'trending-up',
      },
    ],
  };
}

describe('WeeklyDigest', () => {
  it('renders the decision alignment section', () => {
    render(
      <MemoryRouter>
        <WeeklyDigest digest={makeDigest()} activePeriod="weekly" onPeriodChange={() => {}} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Financial decision alignment')).toBeTruthy();
    expect(screen.getByText('Decision alignment score')).toBeTruthy();
    expect(screen.getByText('Values vs. spending radar')).toBeTruthy();
    expect(screen.getByText('Gentle alignment nudges')).toBeTruthy();
  });
});
