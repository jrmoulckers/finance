// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { generateCoachSuggestions } from './suggestions';
import type { CashFlowProjection, SpendingAnomaly, BudgetVelocity } from './types';

const cashFlow: CashFlowProjection = {
  currentBalanceCents: 50000,
  projectedRecurringIncomeCents: 100000,
  projectedRecurringExpenseCents: 40000,
  projectedDiscretionaryExpenseCents: 30000,
  projectedEndBalanceCents: -20000,
  daysRemaining: 10,
  willOverdraft: true,
  balanceSnapshots: [],
  recurringItems: [
    {
      id: 'recurring:rent',
      label: 'Rent',
      type: 'EXPENSE',
      cadence: 'monthly',
      averageAmountCents: 40000,
      occurrencesRemaining: 1,
      nextExpectedDate: '2025-03-28',
      projectedAmountCents: 40000,
      sourceTransactionIds: ['rent-1', 'rent-2'],
    },
  ],
};

const velocities: BudgetVelocity[] = [
  {
    id: 'velocity:food',
    budgetId: 'budget-food',
    budgetName: 'Food',
    categoryId: 'cat-food',
    categoryName: 'Food',
    budgetAmountCents: 30000,
    spentCents: 20000,
    remainingCents: 10000,
    daysElapsed: 15,
    daysRemaining: 16,
    daysInMonth: 31,
    projectedSpendCents: 41333,
    expectedSpendToDateCents: 14516,
    paceGapCents: 11333,
    recommendedDailySpendCents: 625,
    isOverspendRisk: true,
  },
];

const anomalies: SpendingAnomaly[] = [
  {
    id: 'anomaly:food',
    categoryId: 'cat-food',
    categoryName: 'Food',
    date: '2025-03-15',
    todaySpendCents: 5000,
    baselineDailySpendCents: 2000,
    ratio: 2.5,
    transactionCount: 1,
  },
];

describe('generateCoachSuggestions', () => {
  it('prioritizes cash, pace, and anomaly suggestions', () => {
    const suggestions = generateCoachSuggestions({ velocities, cashFlow, anomalies });

    expect(suggestions[0].severity).toBe('critical');
    expect(suggestions[0].title).toMatch(/cash buffer/i);
    expect(suggestions[1].title).toMatch(/slow food spending pace/i);
    expect(suggestions[2].title).toMatch(/review today's food spike/i);
  });

  it('returns an on-track suggestion when there are no issues', () => {
    const suggestions = generateCoachSuggestions({
      velocities: [
        {
          ...velocities[0],
          isOverspendRisk: false,
          projectedSpendCents: 25000,
          paceGapCents: -5000,
        },
      ],
      cashFlow: {
        ...cashFlow,
        projectedEndBalanceCents: 80000,
        willOverdraft: false,
        recurringItems: [],
      },
      anomalies: [],
    });

    expect(suggestions[0].title).toMatch(/on track/i);
  });
});
