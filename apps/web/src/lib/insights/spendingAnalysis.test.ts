// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { Category, Transaction } from '../../kmp/bridge';
import { analyzeSpendingByCategory } from './spendingAnalysis';

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
} as const;

function makeCategory(id: string, name: string): Category {
  return {
    id,
    householdId: 'household-1',
    name,
    icon: null,
    color: null,
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 1,
    isBiometricProtected: false,
    ...syncMetadata,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'transaction-1',
    householdId: 'household-1',
    accountId: 'account-1',
    categoryId: 'food',
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: -5_000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: null,
    note: null,
    date: '2025-01-05',
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
    ...overrides,
  };
}

describe('analyzeSpendingByCategory', () => {
  it('builds top category comparisons month-over-month', () => {
    const categories = [makeCategory('food', 'Food'), makeCategory('transport', 'Transport')];
    const transactions = [
      makeTransaction({
        id: 'current-food',
        categoryId: 'food',
        amount: { amount: -5_000 },
        date: '2025-01-05',
      }),
      makeTransaction({
        id: 'current-transport',
        categoryId: 'transport',
        amount: { amount: -2_000 },
        date: '2025-01-07',
      }),
      makeTransaction({
        id: 'previous-food',
        categoryId: 'food',
        amount: { amount: -3_000 },
        date: '2024-12-10',
      }),
      makeTransaction({
        id: 'previous-transport',
        categoryId: 'transport',
        amount: { amount: -4_000 },
        date: '2024-12-08',
      }),
    ];

    const analysis = analyzeSpendingByCategory(
      transactions,
      categories,
      new Date('2025-01-20T12:00:00Z'),
    );

    expect(analysis.totalCurrentSpending).toBe(7_000);
    expect(analysis.totalPreviousSpending).toBe(7_000);
    expect(analysis.change.direction).toBe('flat');
    expect(analysis.topCategories[0]).toMatchObject({
      categoryName: 'Food',
      currentAmount: 5_000,
      previousAmount: 3_000,
      shareOfSpending: 71,
    });
    expect(analysis.topCategories[0]?.change.percent).toBe(66.7);
    expect(analysis.topCategories[1]).toMatchObject({
      categoryName: 'Transport',
      currentAmount: 2_000,
      previousAmount: 4_000,
    });
    expect(analysis.topCategories[1]?.change.direction).toBe('down');
  });
});
