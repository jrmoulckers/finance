// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { Account, Bill, Transaction } from '../../kmp/bridge';
import { identifyStressIndicators } from './stressIndicators';

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
    currentBalance: { amount: 90_000 },
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
    id: crypto.randomUUID(),
    householdId: 'household-1',
    accountId: 'checking',
    categoryId: 'food',
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: -5_000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: null,
    note: null,
    date: '2025-01-20',
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

function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: crypto.randomUUID(),
    householdId: 'household-1',
    name: 'Utilities',
    payee: 'Utility Co',
    amount: { amount: 20_000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    dueDate: '2025-01-24',
    frequency: 'MONTHLY',
    status: 'UPCOMING',
    categoryId: null,
    accountId: null,
    note: null,
    isAutoPay: false,
    reminderDaysBefore: 3,
    lastPaidDate: null,
    ...syncMetadata,
    ...overrides,
  };
}

describe('identifyStressIndicators', () => {
  it('returns a calm summary when finances are stable', () => {
    const result = identifyStressIndicators({
      now: new Date('2025-01-20T12:00:00Z'),
      accounts: [makeAccount({ currentBalance: { amount: 250_000 } })],
      transactions: [
        makeTransaction({
          id: 'income',
          type: 'INCOME',
          amount: { amount: 220_000 },
          date: '2025-01-05',
        }),
        makeTransaction({ id: 'expense', amount: { amount: -60_000 }, date: '2025-01-10' }),
        makeTransaction({
          id: 'prev-income',
          type: 'INCOME',
          amount: { amount: 210_000 },
          date: '2024-12-05',
        }),
        makeTransaction({ id: 'prev-expense', amount: { amount: -65_000 }, date: '2024-12-12' }),
      ],
      bills: [makeBill({ amount: { amount: 15_000 }, isAutoPay: true })],
    });

    expect(result.indicators).toEqual([]);
    expect(result.highestLevel).toBe('low');
  });

  it('flags declining savings, debt pressure, and bill crunches', () => {
    const result = identifyStressIndicators({
      now: new Date('2025-01-20T12:00:00Z'),
      accounts: [
        makeAccount({ currentBalance: { amount: 15_000 } }),
        makeAccount({ id: 'card', type: 'CREDIT_CARD', currentBalance: { amount: -180_000 } }),
      ],
      transactions: [
        makeTransaction({
          id: 'income-current',
          type: 'INCOME',
          amount: { amount: 120_000 },
          date: '2025-01-05',
        }),
        makeTransaction({
          id: 'expense-current-1',
          amount: { amount: -90_000 },
          date: '2025-01-07',
        }),
        makeTransaction({
          id: 'expense-current-2',
          amount: { amount: -65_000 },
          date: '2025-01-11',
        }),
        makeTransaction({
          id: 'card-charge-1',
          accountId: 'card',
          amount: { amount: -45_000 },
          date: '2025-01-12',
        }),
        makeTransaction({
          id: 'prev-income',
          type: 'INCOME',
          amount: { amount: 170_000 },
          date: '2024-12-05',
        }),
        makeTransaction({ id: 'prev-expense', amount: { amount: -70_000 }, date: '2024-12-10' }),
      ],
      bills: [
        makeBill({ amount: { amount: 30_000 }, status: 'OVERDUE', dueDate: '2025-01-10' }),
        makeBill({ amount: { amount: 40_000 }, dueDate: '2025-01-23' }),
      ],
    });

    expect(result.indicators.length).toBeGreaterThanOrEqual(2);
    expect(result.indicators.some((indicator) => indicator.kind === 'declining-savings')).toBe(
      true,
    );
    expect(result.indicators.some((indicator) => indicator.kind === 'debt-pressure')).toBe(true);
    expect(result.indicators.some((indicator) => indicator.kind === 'bill-crunch')).toBe(true);
  });
});
