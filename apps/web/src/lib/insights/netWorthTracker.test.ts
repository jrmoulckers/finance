// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { Account, Transaction } from '../../kmp/bridge';
import { calculateNetWorthTrend } from './netWorthTracker';

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
} as const;

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'account-1',
    householdId: 'household-1',
    name: 'Checking',
    type: 'CHECKING',
    currency: { code: 'USD', decimalPlaces: 2 },
    currentBalance: { amount: 150_000 },
    isArchived: false,
    sortOrder: 1,
    icon: null,
    color: null,
    ...syncMetadata,
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'transaction-1',
    householdId: 'household-1',
    accountId: 'account-1',
    categoryId: null,
    type: 'INCOME',
    status: 'CLEARED',
    amount: { amount: 40_000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: null,
    note: null,
    date: '2025-01-17',
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

describe('calculateNetWorthTrend', () => {
  it('computes assets, liabilities, and period-over-period change', () => {
    const accounts = [
      makeAccount({ id: 'checking', currentBalance: { amount: 150_000 } }),
      makeAccount({ id: 'savings', type: 'SAVINGS', currentBalance: { amount: 50_000 } }),
      makeAccount({ id: 'card', type: 'CREDIT_CARD', currentBalance: { amount: -20_000 } }),
    ];
    const transactions = [
      makeTransaction({
        id: 'income-current',
        type: 'INCOME',
        amount: { amount: 40_000 },
        date: '2025-01-17',
      }),
      makeTransaction({
        id: 'expense-previous',
        type: 'EXPENSE',
        amount: { amount: -10_000 },
        date: '2025-01-10',
      }),
    ];

    const trend = calculateNetWorthTrend(
      accounts,
      transactions,
      'weekly',
      new Date('2025-01-20T12:00:00Z'),
    );

    expect(trend.assets).toBe(200_000);
    expect(trend.liabilities).toBe(20_000);
    expect(trend.current).toBe(180_000);
    expect(trend.previous).toBe(140_000);
    expect(trend.change.amount).toBe(40_000);
    expect(trend.change.direction).toBe('up');
    expect(trend.change.percent).toBe(28.6);
    expect(trend.history).toHaveLength(8);
    expect(trend.history.at(-1)?.netWorth).toBe(180_000);
  });
});
