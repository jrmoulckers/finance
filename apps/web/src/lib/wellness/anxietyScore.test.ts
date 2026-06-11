// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { Account, Bill, Transaction } from '../../kmp/bridge';
import { calculateAnxietyScore } from './anxietyScore';

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
    currentBalance: { amount: 250_000 },
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
    accountId: 'account-1',
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
    name: 'Rent',
    payee: 'Landlord',
    amount: { amount: 75_000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    dueDate: '2025-01-25',
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

describe('calculateAnxietyScore', () => {
  it('keeps the score low when cash buffers and savings are healthy', () => {
    const result = calculateAnxietyScore({
      now: new Date('2025-01-20T12:00:00Z'),
      accounts: [
        makeAccount({ currentBalance: { amount: 350_000 } }),
        makeAccount({ id: 'savings', type: 'SAVINGS', currentBalance: { amount: 500_000 } }),
        makeAccount({ id: 'card', type: 'CREDIT_CARD', currentBalance: { amount: -10_000 } }),
      ],
      transactions: [
        makeTransaction({
          id: 'income',
          type: 'INCOME',
          amount: { amount: 300_000 },
          date: '2025-01-05',
        }),
        makeTransaction({ id: 'expense-1', amount: { amount: -5_000 }, date: '2025-01-07' }),
        makeTransaction({ id: 'expense-2', amount: { amount: -6_000 }, date: '2025-01-11' }),
        makeTransaction({ id: 'expense-3', amount: { amount: -4_000 }, date: '2024-12-07' }),
        makeTransaction({
          id: 'prev-income',
          type: 'INCOME',
          amount: { amount: 250_000 },
          date: '2024-12-05',
        }),
      ],
      bills: [makeBill({ amount: { amount: 20_000 }, isAutoPay: true })],
    });

    expect(result.level).toBe('low');
    expect(result.score).toBeLessThan(25);
    expect(result.metrics.liquidBufferDays).toBeGreaterThan(30);
    expect(result.breakdown.billStress).toBeLessThan(5);
  });

  it('raises the score when buffers are thin and bills are overdue', () => {
    const result = calculateAnxietyScore({
      now: new Date('2025-01-20T12:00:00Z'),
      accounts: [
        makeAccount({ currentBalance: { amount: 2_500 } }),
        makeAccount({ id: 'card', type: 'CREDIT_CARD', currentBalance: { amount: -120_000 } }),
        makeAccount({ id: 'loan', type: 'LOAN', currentBalance: { amount: -300_000 } }),
      ],
      transactions: [
        makeTransaction({ id: 'expense-1', amount: { amount: -25_000 }, date: '2025-01-03' }),
        makeTransaction({ id: 'expense-2', amount: { amount: -2_000 }, date: '2025-01-04' }),
        makeTransaction({ id: 'expense-3', amount: { amount: -40_000 }, date: '2025-01-09' }),
        makeTransaction({ id: 'expense-4', amount: { amount: -1_000 }, date: '2025-01-13' }),
        makeTransaction({ id: 'expense-5', amount: { amount: -35_000 }, date: '2025-01-18' }),
        makeTransaction({
          id: 'income',
          type: 'INCOME',
          amount: { amount: 120_000 },
          date: '2025-01-05',
        }),
        makeTransaction({
          id: 'prev-income',
          type: 'INCOME',
          amount: { amount: 180_000 },
          date: '2024-12-05',
        }),
        makeTransaction({ id: 'prev-expense', amount: { amount: -20_000 }, date: '2024-12-12' }),
      ],
      bills: [
        makeBill({ amount: { amount: 60_000 }, isAutoPay: false, dueDate: '2025-01-22' }),
        makeBill({ amount: { amount: 40_000 }, isAutoPay: false, dueDate: '2025-01-24' }),
        makeBill({ status: 'OVERDUE', dueDate: '2025-01-10', amount: { amount: 15_000 } }),
      ],
    });

    expect(result.level === 'high' || result.level === 'severe').toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.breakdown.billStress).toBeGreaterThan(10);
    expect(result.breakdown.debtPressure).toBeGreaterThan(10);
    expect(result.metrics.overdueBills).toBe(1);
  });
});
