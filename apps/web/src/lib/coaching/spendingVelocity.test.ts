// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { analyzeSpendingVelocity } from './spendingVelocity';
import type { Budget, Transaction } from '../../kmp/bridge';

function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: 'budget-food',
    householdId: 'hh-1',
    categoryId: 'cat-food',
    name: 'Groceries',
    amount: { amount: 30000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    period: 'MONTHLY',
    startDate: '2025-03-01',
    endDate: null,
    isRollover: false,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
    ...overrides,
  };
}

function makeExpense(
  date: string,
  amountCents: number,
  categoryId: string = 'cat-food',
): Transaction {
  return {
    id: `${date}-${amountCents}`,
    householdId: 'hh-1',
    accountId: 'acct-1',
    categoryId,
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: amountCents },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: 'Store',
    note: null,
    date,
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
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  };
}

describe('analyzeSpendingVelocity', () => {
  it('flags monthly budgets that are ahead of pace', () => {
    const velocities = analyzeSpendingVelocity({
      budgets: [makeBudget()],
      categoriesById: new Map([['cat-food', 'Food']]),
      transactions: [makeExpense('2025-03-05', 10000), makeExpense('2025-03-10', 10000)],
      today: '2025-03-15',
    });

    expect(velocities).toHaveLength(1);
    expect(velocities[0].spentCents).toBe(20000);
    expect(velocities[0].projectedSpendCents).toBeGreaterThan(30000);
    expect(velocities[0].isOverspendRisk).toBe(true);
    expect(velocities[0].recommendedDailySpendCents).toBe(625);
  });

  it('ignores budgets that are not active monthly budgets', () => {
    const velocities = analyzeSpendingVelocity({
      budgets: [
        makeBudget({ id: 'budget-yearly', period: 'YEARLY' }),
        makeBudget({ id: 'budget-old', endDate: '2025-02-28' }),
      ],
      categoriesById: new Map([['cat-food', 'Food']]),
      transactions: [makeExpense('2025-03-05', 10000)],
      today: '2025-03-15',
    });

    expect(velocities).toHaveLength(0);
  });
});
