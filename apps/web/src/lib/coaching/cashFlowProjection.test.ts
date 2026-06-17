// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { projectCashFlow } from './cashFlowProjection';
import type { Account, Transaction } from '../../kmp/bridge';

function makeAccount(overrides: Partial<Account>): Account {
  return {
    id: 'acct-1',
    householdId: 'hh-1',
    name: 'Checking',
    type: 'CHECKING',
    currency: { code: 'USD', decimalPlaces: 2 },
    currentBalance: { amount: 100000 },
    isArchived: false,
    sortOrder: 0,
    icon: null,
    color: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
    ...overrides,
  };
}

function makeTransaction(options: {
  id: string;
  date: string;
  type: 'INCOME' | 'EXPENSE';
  amountCents: number;
  payee: string;
  categoryId?: string | null;
}): Transaction {
  return {
    id: options.id,
    householdId: 'hh-1',
    accountId: 'acct-1',
    categoryId: options.categoryId ?? null,
    type: options.type,
    status: 'CLEARED',
    amount: { amount: options.amountCents },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: options.payee,
    note: null,
    date: options.date,
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

describe('projectCashFlow', () => {
  it('projects month-end balance from recurring and discretionary patterns', () => {
    const projection = projectCashFlow({
      accounts: [
        makeAccount({
          id: 'checking',
          name: 'Checking',
          type: 'CHECKING',
          currentBalance: { amount: 100000 },
        }),
        makeAccount({
          id: 'investing',
          name: 'Brokerage',
          type: 'INVESTMENT',
          currentBalance: { amount: 999999 },
        }),
      ],
      categoriesById: new Map([
        ['cat-salary', 'Salary'],
        ['cat-bills', 'Bills'],
        ['cat-food', 'Food'],
      ]),
      transactions: [
        makeTransaction({
          id: 'salary-1',
          date: '2025-02-14',
          type: 'INCOME',
          amountCents: 150000,
          payee: 'Employer',
          categoryId: 'cat-salary',
        }),
        makeTransaction({
          id: 'salary-2',
          date: '2025-02-28',
          type: 'INCOME',
          amountCents: 150000,
          payee: 'Employer',
          categoryId: 'cat-salary',
        }),
        makeTransaction({
          id: 'utility-1',
          date: '2025-01-20',
          type: 'EXPENSE',
          amountCents: 20000,
          payee: 'Utilities',
          categoryId: 'cat-bills',
        }),
        makeTransaction({
          id: 'utility-2',
          date: '2025-02-19',
          type: 'EXPENSE',
          amountCents: 20000,
          payee: 'Utilities',
          categoryId: 'cat-bills',
        }),
        makeTransaction({
          id: 'grocery-1',
          date: '2025-03-02',
          type: 'EXPENSE',
          amountCents: 10000,
          payee: 'Grocer',
          categoryId: 'cat-food',
        }),
        makeTransaction({
          id: 'grocery-2',
          date: '2025-03-06',
          type: 'EXPENSE',
          amountCents: 5000,
          payee: 'Grocer',
          categoryId: 'cat-food',
        }),
      ],
      today: '2025-03-10',
    });

    expect(projection.currentBalanceCents).toBe(100000);
    expect(projection.projectedRecurringIncomeCents).toBe(300000);
    expect(projection.projectedRecurringExpenseCents).toBe(20000);
    expect(projection.projectedDiscretionaryExpenseCents).toBe(31500);
    expect(projection.projectedEndBalanceCents).toBe(348500);
    expect(projection.recurringItems).toHaveLength(2);
  });

  it('flags overdraft risk when the projected ending balance is negative', () => {
    const projection = projectCashFlow({
      accounts: [makeAccount({ currentBalance: { amount: 10000 } })],
      categoriesById: new Map([['cat-food', 'Food']]),
      transactions: [
        makeTransaction({
          id: 'rent-1',
          date: '2025-01-20',
          type: 'EXPENSE',
          amountCents: 50000,
          payee: 'Rent',
          categoryId: 'cat-food',
        }),
        makeTransaction({
          id: 'rent-2',
          date: '2025-02-19',
          type: 'EXPENSE',
          amountCents: 50000,
          payee: 'Rent',
          categoryId: 'cat-food',
        }),
      ],
      today: '2025-03-10',
    });

    expect(projection.willOverdraft).toBe(true);
    expect(projection.projectedEndBalanceCents).toBeLessThan(0);
  });
});
