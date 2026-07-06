// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { Account, Category, Transaction } from '../../kmp/bridge';
import { Currencies } from '../../kmp/bridge';
import {
  generateBalanceSheet,
  generateCashFlow,
  generateProfitAndLoss,
} from './financial-statements';

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'tx-default',
    householdId: 'household-1',
    accountId: 'checking',
    categoryId: null,
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: 0 },
    currency: Currencies.USD,
    payee: null,
    note: null,
    date: '2025-01-01',
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
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: false,
    ...overrides,
  };
}

function account(overrides: Partial<Account>): Account {
  return {
    id: 'checking',
    householdId: 'household-1',
    name: 'Checking',
    type: 'CHECKING',
    currency: Currencies.USD,
    currentBalance: { amount: 0 },
    isArchived: false,
    sortOrder: 0,
    icon: null,
    color: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: false,
    ...overrides,
  };
}

const categories: Category[] = [
  {
    id: 'salary',
    householdId: 'household-1',
    name: 'Salary',
    icon: null,
    color: null,
    parentId: null,
    isIncome: true,
    isSystem: false,
    sortOrder: 0,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: false,
  },
  {
    id: 'groceries',
    householdId: 'household-1',
    name: 'Groceries',
    icon: null,
    color: null,
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 1,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: false,
  },
  {
    id: 'dining',
    householdId: 'household-1',
    name: 'Dining Out',
    icon: null,
    color: null,
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 2,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: false,
  },
];

describe('generateProfitAndLoss', () => {
  it('groups income and expenses by category with correct sign handling', () => {
    const report = generateProfitAndLoss(
      [
        transaction({
          id: 'paycheck',
          type: 'INCOME',
          categoryId: 'salary',
          amount: { amount: 300_000 },
        }),
        transaction({
          id: 'groceries-negative',
          type: 'EXPENSE',
          categoryId: 'groceries',
          amount: { amount: -12_345 },
        }),
        transaction({
          id: 'groceries-positive',
          type: 'EXPENSE',
          categoryId: 'groceries',
          amount: { amount: 5_000 },
        }),
        transaction({ id: 'transfer', type: 'TRANSFER', amount: { amount: 100_000 } }),
      ],
      categories,
    );

    expect(report.income).toEqual([
      { id: 'salary', label: 'Salary', amount: 300_000, transactionCount: 1 },
    ]);
    expect(report.expenses).toEqual([
      { id: 'groceries', label: 'Groceries', amount: 17_345, transactionCount: 2 },
    ]);
    expect(report.totalIncome).toBe(300_000);
    expect(report.totalExpenses).toBe(17_345);
    expect(report.netIncome).toBe(282_655);
    expect(report.transactionCount).toBe(3);
  });

  it('filters by inclusive date range and ignores void transactions', () => {
    const report = generateProfitAndLoss(
      [
        transaction({
          id: 'before',
          date: '2024-12-31',
          type: 'INCOME',
          categoryId: 'salary',
          amount: { amount: 10_000 },
        }),
        transaction({
          id: 'start',
          date: '2025-01-01',
          type: 'INCOME',
          categoryId: 'salary',
          amount: { amount: 20_000 },
        }),
        transaction({
          id: 'end',
          date: '2025-01-31',
          type: 'EXPENSE',
          categoryId: 'groceries',
          amount: { amount: 5_000 },
        }),
        transaction({
          id: 'void',
          date: '2025-01-15',
          status: 'VOID',
          type: 'EXPENSE',
          categoryId: 'groceries',
          amount: { amount: 99_999 },
        }),
        transaction({
          id: 'after',
          date: '2025-02-01',
          type: 'EXPENSE',
          categoryId: 'groceries',
          amount: { amount: 7_000 },
        }),
      ],
      categories,
      { startDate: '2025-01-01', endDate: '2025-01-31' },
    );

    expect(report.totalIncome).toBe(20_000);
    expect(report.totalExpenses).toBe(5_000);
    expect(report.transactionCount).toBe(2);
  });

  it('returns empty totals for empty data', () => {
    expect(generateProfitAndLoss([], categories)).toMatchObject({
      income: [],
      expenses: [],
      totalIncome: 0,
      totalExpenses: 0,
      netIncome: 0,
      transactionCount: 0,
    });
  });
});

describe('generateCashFlow', () => {
  it('summarizes cash inflows, operating outflows, discretionary outflows, and transfers', () => {
    const report = generateCashFlow(
      [
        transaction({
          id: 'income',
          accountId: 'checking',
          type: 'INCOME',
          categoryId: 'salary',
          amount: { amount: 400_000 },
        }),
        transaction({
          id: 'groceries',
          accountId: 'checking',
          type: 'EXPENSE',
          categoryId: 'groceries',
          amount: { amount: -25_000 },
        }),
        transaction({
          id: 'dining',
          accountId: 'checking',
          type: 'EXPENSE',
          categoryId: 'dining',
          amount: { amount: 8_000 },
        }),
        transaction({
          id: 'transfer-in',
          accountId: 'checking',
          type: 'TRANSFER',
          amount: { amount: 50_000 },
        }),
        transaction({
          id: 'transfer-out',
          accountId: 'checking',
          type: 'TRANSFER',
          amount: { amount: -10_000 },
        }),
        transaction({
          id: 'ignored-card',
          accountId: 'card',
          type: 'EXPENSE',
          categoryId: 'dining',
          amount: { amount: 9_999 },
        }),
      ],
      [
        account({ id: 'checking', type: 'CHECKING' }),
        account({ id: 'card', name: 'Visa', type: 'CREDIT_CARD' }),
      ],
      categories,
    );

    expect(report.totalInflows).toBe(450_000);
    expect(report.totalOutflows).toBe(43_000);
    expect(report.netChangeInCash).toBe(407_000);
    expect(report.inflows.find((line) => line.label === 'Salary')).toMatchObject({
      group: 'Operating',
      amount: 400_000,
    });
    expect(report.outflows.find((line) => line.label === 'Dining Out')).toMatchObject({
      group: 'Discretionary',
      amount: 8_000,
    });
    expect(report.outflows.find((line) => line.label === 'Transfers')).toMatchObject({
      group: 'Transfers',
      amount: 10_000,
    });
  });

  it('filters cash flow by period and returns empty totals for no cash accounts', () => {
    const report = generateCashFlow(
      [
        transaction({
          id: 'income',
          date: '2025-02-01',
          type: 'INCOME',
          categoryId: 'salary',
          amount: { amount: 10_000 },
        }),
      ],
      [],
      categories,
      { startDate: '2025-01-01', endDate: '2025-01-31' },
    );

    expect(report.totalInflows).toBe(0);
    expect(report.totalOutflows).toBe(0);
    expect(report.transactionCount).toBe(0);
  });
});

describe('generateBalanceSheet', () => {
  it('classifies assets and liabilities and computes net worth from balances', () => {
    const report = generateBalanceSheet([
      account({
        id: 'checking',
        name: 'Checking',
        type: 'CHECKING',
        currentBalance: { amount: 125_000 },
      }),
      account({
        id: 'brokerage',
        name: 'Brokerage',
        type: 'INVESTMENT',
        currentBalance: { amount: 2_000_000 },
      }),
      account({
        id: 'card',
        name: 'Visa',
        type: 'CREDIT_CARD',
        currentBalance: { amount: -45_000 },
      }),
      account({ id: 'loan', name: 'Auto Loan', type: 'LOAN', currentBalance: { amount: 800_000 } }),
    ]);

    expect(report.totalAssets).toBe(2_125_000);
    expect(report.totalLiabilities).toBe(845_000);
    expect(report.netWorth).toBe(1_280_000);
    expect(report.assets.map((line) => line.label)).toEqual(['Brokerage', 'Checking']);
    expect(report.liabilities.map((line) => line.label)).toEqual(['Auto Loan', 'Visa']);
  });

  it('excludes archived accounts so it reconciles with the net worth page', () => {
    const report = generateBalanceSheet([
      account({ id: 'active', type: 'CHECKING', currentBalance: { amount: 500_000 } }),
      account({
        id: 'archived',
        name: 'Old Savings',
        type: 'SAVINGS',
        currentBalance: { amount: 300_000 },
        isArchived: true,
      }),
    ]);

    expect(report.totalAssets).toBe(500_000);
    expect(report.assets.map((line) => line.label)).toEqual(['Checking']);
    expect(report.netWorth).toBe(500_000);
  });

  it('uses transactions after the as-of date to estimate historical balances', () => {
    const report = generateBalanceSheet(
      [account({ id: 'checking', currentBalance: { amount: 150_000 } })],
      [
        transaction({
          id: 'future-income',
          accountId: 'checking',
          date: '2025-02-01',
          type: 'INCOME',
          amount: { amount: 20_000 },
        }),
        transaction({
          id: 'future-expense',
          accountId: 'checking',
          date: '2025-02-02',
          type: 'EXPENSE',
          amount: { amount: 5_000 },
        }),
        transaction({
          id: 'already-included',
          accountId: 'checking',
          date: '2025-01-31',
          type: 'INCOME',
          amount: { amount: 99_999 },
        }),
      ],
      { asOfDate: '2025-01-31' },
    );

    expect(report.totalAssets).toBe(135_000);
    expect(report.netWorth).toBe(135_000);
  });

  it('returns zero totals for empty account data', () => {
    expect(generateBalanceSheet([])).toMatchObject({
      assets: [],
      liabilities: [],
      totalAssets: 0,
      totalLiabilities: 0,
      netWorth: 0,
      accountCount: 0,
    });
  });
});
