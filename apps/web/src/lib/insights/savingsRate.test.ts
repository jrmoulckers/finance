// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { Transaction } from '../../kmp/bridge';
import { analyzeSavingsRate } from './savingsRate';

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
} as const;

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'transaction-1',
    householdId: 'household-1',
    accountId: 'account-1',
    categoryId: null,
    type: 'INCOME',
    status: 'CLEARED',
    amount: { amount: 100_000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: null,
    note: null,
    date: '2025-01-02',
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

describe('analyzeSavingsRate', () => {
  it('calculates current, previous, and historical savings-rate data', () => {
    const transactions = [
      makeTransaction({
        id: 'income-current',
        type: 'INCOME',
        amount: { amount: 100_000 },
        date: '2025-01-02',
      }),
      makeTransaction({
        id: 'expense-current',
        type: 'EXPENSE',
        amount: { amount: -40_000 },
        date: '2025-01-10',
      }),
      makeTransaction({
        id: 'income-previous',
        type: 'INCOME',
        amount: { amount: 80_000 },
        date: '2024-12-03',
      }),
      makeTransaction({
        id: 'expense-previous',
        type: 'EXPENSE',
        amount: { amount: -60_000 },
        date: '2024-12-12',
      }),
    ];

    const analysis = analyzeSavingsRate(transactions, 'monthly', new Date('2025-01-20T12:00:00Z'));

    expect(analysis.currentIncome).toBe(100_000);
    expect(analysis.currentSpending).toBe(40_000);
    expect(analysis.currentSavings).toBe(60_000);
    expect(analysis.currentRate).toBe(60);
    expect(analysis.previousRate).toBe(25);
    expect(analysis.rateChangePoints).toBe(35);
    expect(analysis.change.direction).toBe('up');
    expect(analysis.history).toHaveLength(6);
  });
});
