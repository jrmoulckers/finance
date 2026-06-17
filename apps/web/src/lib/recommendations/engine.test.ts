// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { generateRecommendations } from './engine';
import type { BudgetWithSpending } from '../../db/repositories/budgets';
import type { Account, Category, Transaction } from '../../kmp/bridge';

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
} as const;

function makeAccount(id: string, type: Account['type'], amount: number): Account {
  return {
    id,
    householdId: 'household-1',
    name: id,
    type,
    currency: { code: 'USD', decimalPlaces: 2 },
    currentBalance: { amount },
    isArchived: false,
    sortOrder: 0,
    icon: null,
    color: null,
    ...syncMetadata,
  };
}

function makeCategory(id: string, name: string, isIncome: boolean = false): Category {
  return {
    id,
    householdId: 'household-1',
    name,
    icon: null,
    color: null,
    parentId: null,
    isIncome,
    isSystem: false,
    sortOrder: 0,
    isBiometricProtected: false,
    ...syncMetadata,
  };
}

function makeTransaction(
  id: string,
  type: Transaction['type'],
  amount: number,
  date: string,
  categoryId: string | null,
  payee: string,
): Transaction {
  return {
    id,
    householdId: 'household-1',
    accountId: 'checking',
    categoryId,
    type,
    status: 'CLEARED',
    amount: { amount },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee,
    note: null,
    date,
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: [],
    moodTag: null,
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
    ...syncMetadata,
  };
}

function makeBudget(
  id: string,
  name: string,
  amount: number,
  spentAmount: number,
  categoryId: string,
): BudgetWithSpending {
  return {
    id,
    householdId: 'household-1',
    categoryId,
    name,
    amount: { amount },
    currency: { code: 'USD', decimalPlaces: 2 },
    period: 'MONTHLY',
    startDate: '2025-05-01',
    endDate: null,
    isRollover: false,
    sortOrder: 0,
    spentAmount: { amount: spentAmount },
    remainingAmount: { amount: amount - spentAmount },
    ...syncMetadata,
  };
}

describe('generateRecommendations', () => {
  it('surfaces personalized savings, runway, budget, and subscription opportunities', () => {
    const categories: Category[] = [
      makeCategory('income', 'Income', true),
      makeCategory('dining', 'Dining'),
      makeCategory('rent', 'Rent'),
      makeCategory('groceries', 'Groceries'),
      makeCategory('subscription', 'Subscriptions'),
    ];

    const transactions: Transaction[] = [
      makeTransaction('income-current', 'INCOME', 250_000, '2025-05-03', 'income', 'Paycheck'),
      makeTransaction('rent-current', 'EXPENSE', 90_000, '2025-05-02', 'rent', 'Landlord'),
      makeTransaction('dining-current-1', 'EXPENSE', 42_000, '2025-05-05', 'dining', 'Restaurants'),
      makeTransaction('dining-current-2', 'EXPENSE', 28_000, '2025-05-12', 'dining', 'Restaurants'),
      makeTransaction('grocery-current', 'EXPENSE', 60_000, '2025-05-10', 'groceries', 'Market'),
      makeTransaction('spotify-april', 'EXPENSE', 999, '2025-04-01', 'subscription', 'Spotify'),
      makeTransaction('spotify-march', 'EXPENSE', 999, '2025-03-01', 'subscription', 'Spotify'),
      makeTransaction('adobe-april', 'EXPENSE', 2_099, '2025-04-15', 'subscription', 'Adobe'),
      makeTransaction('adobe-march', 'EXPENSE', 2_099, '2025-03-15', 'subscription', 'Adobe'),
      makeTransaction('dining-previous', 'EXPENSE', 50_000, '2025-04-08', 'dining', 'Restaurants'),
      makeTransaction('rent-previous', 'EXPENSE', 90_000, '2025-04-02', 'rent', 'Landlord'),
      makeTransaction('income-previous', 'INCOME', 250_000, '2025-04-03', 'income', 'Paycheck'),
    ];

    const result = generateRecommendations(
      {
        accounts: [
          makeAccount('checking', 'CHECKING', 80_000),
          makeAccount('savings', 'SAVINGS', 60_000),
        ],
        budgets: [makeBudget('budget-dining', 'Dining', 30_000, 42_000, 'dining')],
        categories,
        goals: [],
        transactions,
        now: new Date('2025-05-18T12:00:00Z'),
      },
      { maxRecommendations: 6 },
    );

    expect(result.recommendations.length).toBeGreaterThanOrEqual(5);
    expect(result.recommendations.map((recommendation) => recommendation.title)).toEqual(
      expect.arrayContaining([
        'Dining is already over budget',
        'Your emergency fund covers 0.4 months of expenses',
        'Your savings rate is 12%',
        'You spent 40% more on Dining this month',
        'You have 2 subscriptions with no recent charge activity',
      ]),
    );
    expect(result.summary.totalCount).toBeGreaterThanOrEqual(5);
    expect(result.summary.estimatedMonthlySavingsCents).toBeGreaterThan(0);
    expect(result.recommendations[0]!.score).toBeGreaterThanOrEqual(
      result.recommendations[1]!.score,
    );
  });

  it('returns a steady-state fallback when there is not enough data for action', () => {
    const result = generateRecommendations(
      {
        accounts: [],
        budgets: [],
        categories: [],
        goals: [],
        transactions: [],
        now: new Date('2025-05-18T12:00:00Z'),
      },
      { maxRecommendations: 3 },
    );

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]?.id).toBe('steady-progress');
    expect(result.summary.totalCount).toBe(1);
  });
});
