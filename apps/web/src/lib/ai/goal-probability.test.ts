// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { Goal, Transaction } from '../../kmp/bridge';
import { estimateGoalAchievementProbability } from './goal-probability';

const sync = {
  createdAt: '2025-01-01T12:00:00Z',
  updatedAt: '2025-01-01T12:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    ...sync,
    id: 'g1',
    householdId: 'h1',
    name: 'Emergency fund',
    description: null,
    targetAmount: { amount: 120_000 },
    currentAmount: { amount: 0 },
    currency: { code: 'USD', decimalPlaces: 2 },
    targetDate: '2025-07-01',
    status: 'ACTIVE',
    icon: null,
    color: null,
    accountId: null,
    ...overrides,
  };
}

function tx(id: string, date: string, type: Transaction['type'], amount: number): Transaction {
  return {
    ...sync,
    id,
    householdId: 'h1',
    accountId: 'a1',
    categoryId: null,
    status: 'CLEARED',
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: null,
    note: null,
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: [],
    merchantAddress: null,
    merchantCity: null,
    merchantState: null,
    merchantZip: null,
    merchantCountry: null,
    externalReferenceId: null,
    statementDescription: null,
    customFields: null,
    extraNotes: null,
    counterpartyName: null,
    counterpartyAccountId: null,
    date,
    type,
    amount: { amount },
  };
}

const history = [
  tx('i1', '2025-01-01', 'INCOME', 300_000),
  tx('e1', '2025-01-02', 'EXPENSE', 200_000),
  tx('i2', '2025-02-01', 'INCOME', 300_000),
  tx('e2', '2025-02-02', 'EXPENSE', 200_000),
  tx('i3', '2025-03-01', 'INCOME', 300_000),
  tx('e3', '2025-03-02', 'EXPENSE', 200_000),
];

describe('estimateGoalAchievementProbability', () => {
  it('estimates probability, required contribution, expected contribution, and gap', () => {
    const result = estimateGoalAchievementProbability({
      goals: [goal()],
      transactions: history,
      asOfDate: '2025-01-01',
      plannedContributions: [{ goalId: 'g1', monthlyAmountCents: 25_000 }],
    })[0];

    expect(result.status).toBe('ready');
    expect(result.probability).toBeGreaterThan(0.5);
    expect(result.requiredMonthlyContributionCents).toBeGreaterThan(0);
    expect(result.monthlyGapCents).toBe(0);
    expect(result.optimisticOutcomeCents).toBeGreaterThanOrEqual(result.expectedOutcomeCents ?? 0);
  });

  it('recommends adjustments when probability is below threshold', () => {
    const result = estimateGoalAchievementProbability({
      goals: [goal({ targetAmount: { amount: 300_000 } })],
      transactions: history,
      asOfDate: '2025-01-01',
      plannedContributions: [{ goalId: 'g1', monthlyAmountCents: 10_000 }],
      minimumProbability: 0.8,
    })[0];

    expect(result.probability).toBeLessThan(0.8);
    expect(result.adjustmentOptions[0]).toContain('Increase contributions');
  });

  it('handles goals without target dates and insufficient history', () => {
    const noDate = estimateGoalAchievementProbability({
      goals: [goal({ targetDate: null })],
      transactions: history,
      asOfDate: '2025-01-01',
    })[0];
    const sparse = estimateGoalAchievementProbability({
      goals: [goal()],
      transactions: [tx('only', '2025-01-01', 'INCOME', 1_000)],
      asOfDate: '2025-01-01',
    })[0];

    expect(noDate.status).toBe('no-target-date');
    expect(sparse.status).toBe('insufficient-history');
  });
});
