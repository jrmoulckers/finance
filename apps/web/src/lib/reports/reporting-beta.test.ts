// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { Account, Category, Transaction } from '../../kmp/bridge';
import {
  buildCategoryDrillDown,
  buildSpendingTrendInsight,
  buildYearInReview,
  detectReportAnomalies,
  filterTransactionsForReport,
} from './reporting-beta';

const currency = { code: 'USD', decimalPlaces: 2 } as const;
const metadata = {
  householdId: 'hh-1',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function tx(
  overrides: Partial<Transaction> & Pick<Transaction, 'id' | 'date' | 'type' | 'amount'>,
): Transaction {
  return {
    ...metadata,
    id: overrides.id,
    accountId: overrides.accountId ?? 'acct-1',
    categoryId: overrides.categoryId ?? 'cat-food',
    type: overrides.type,
    status: overrides.status ?? 'CLEARED',
    amount: overrides.amount,
    currency,
    payee: overrides.payee ?? 'Merchant',
    note: overrides.note ?? null,
    date: overrides.date,
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: overrides.tags ?? [],
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
  };
}

const categories: Category[] = [
  {
    ...metadata,
    id: 'cat-food',
    name: 'Food',
    icon: null,
    color: null,
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 0,
  },
  {
    ...metadata,
    id: 'cat-travel',
    name: 'Travel',
    icon: null,
    color: null,
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 1,
  },
];

const accounts: Account[] = [
  {
    ...metadata,
    id: 'acct-1',
    name: 'Checking',
    type: 'CHECKING',
    currency,
    currentBalance: { amount: 100000 },
    isArchived: false,
    sortOrder: 0,
    icon: null,
    color: null,
  },
];

describe('reporting beta aggregations', () => {
  it('filters transactions by report filters', () => {
    const transactions = [
      tx({ id: 'jan', date: '2025-01-10', type: 'EXPENSE', amount: { amount: -1000 } }),
      tx({
        id: 'feb',
        date: '2025-02-10',
        type: 'EXPENSE',
        amount: { amount: -2000 },
        categoryId: 'cat-travel',
      }),
    ];

    expect(
      filterTransactionsForReport(transactions, {
        startDate: '2025-02-01',
        endDate: '2025-02-28',
        categoryIds: ['cat-travel'],
      }).map((item) => item.id),
    ).toEqual(['feb']);
  });

  it('builds category drill-down stats and transaction rows', () => {
    const transactions = [
      tx({
        id: 'small',
        date: '2025-01-10',
        type: 'EXPENSE',
        amount: { amount: -1000 },
        payee: 'Cafe',
      }),
      tx({
        id: 'large',
        date: '2025-01-11',
        type: 'EXPENSE',
        amount: { amount: -5000 },
        payee: 'Market',
      }),
    ];

    const drillDown = buildCategoryDrillDown(transactions, categories, accounts, {
      categoryId: 'cat-food',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
    });

    expect(drillDown).toMatchObject({
      categoryName: 'Food',
      total: 6000,
      transactionCount: 2,
      averageTransaction: 3000,
    });
    expect(drillDown.largestTransaction?.payee).toBe('Market');
  });

  it('detects spending seasonality and current-month pacing', () => {
    const transactions = [
      tx({
        id: 'dec-1',
        date: '2023-12-10',
        type: 'EXPENSE',
        amount: { amount: -80000 },
        categoryId: 'cat-travel',
      }),
      tx({
        id: 'dec-2',
        date: '2024-12-10',
        type: 'EXPENSE',
        amount: { amount: -90000 },
        categoryId: 'cat-travel',
      }),
      tx({
        id: 'jan-1',
        date: '2025-01-03',
        type: 'EXPENSE',
        amount: { amount: -20000 },
        categoryId: 'cat-food',
      }),
      tx({
        id: 'feb-1',
        date: '2025-02-03',
        type: 'EXPENSE',
        amount: { amount: -10000 },
        categoryId: 'cat-food',
      }),
      tx({
        id: 'mar-1',
        date: '2025-03-03',
        type: 'EXPENSE',
        amount: { amount: -10000 },
        categoryId: 'cat-food',
      }),
    ];

    const trend = buildSpendingTrendInsight(
      transactions,
      categories,
      24,
      new Date('2025-03-15T12:00:00Z'),
    );

    expect(trend.insufficientData).toBe(false);
    expect(trend.seasonality.some((signal) => signal.categoryName === 'Travel')).toBe(true);
    expect(trend.monthlyTotals.at(-1)?.month).toBe('2025-03');
  });

  it('builds year-in-review summaries with top categories and changes', () => {
    const transactions = [
      tx({
        id: 'income',
        date: '2025-01-05',
        type: 'INCOME',
        amount: { amount: 200000 },
        categoryId: null,
      }),
      tx({ id: 'food', date: '2025-01-06', type: 'EXPENSE', amount: { amount: -50000 } }),
      tx({ id: 'prev-food', date: '2024-01-06', type: 'EXPENSE', amount: { amount: -20000 } }),
    ];

    const summary = buildYearInReview(transactions, categories, 2025);

    expect(summary.totalIncome).toBe(200000);
    expect(summary.totalExpenses).toBe(50000);
    expect(summary.savingsRate).toBe(75);
    expect(summary.topCategories[0].categoryName).toBe('Food');
    expect(summary.biggestChanges[0]).toMatchObject({ categoryName: 'Food', amountChange: 30000 });
  });

  it('detects reusable report anomalies', () => {
    const transactions = [
      tx({
        id: 'prior-1',
        date: '2025-01-10',
        type: 'EXPENSE',
        amount: { amount: -10000 },
        payee: 'Grocery',
      }),
      tx({
        id: 'prior-2',
        date: '2025-02-10',
        type: 'EXPENSE',
        amount: { amount: -10000 },
        payee: 'Grocery',
      }),
      tx({
        id: 'prior-3',
        date: '2025-03-10',
        type: 'EXPENSE',
        amount: { amount: -10000 },
        payee: 'Grocery',
      }),
      tx({
        id: 'spike',
        date: '2025-04-10',
        type: 'EXPENSE',
        amount: { amount: -30000 },
        payee: 'Grocery',
      }),
      tx({
        id: 'dup-a',
        date: '2025-04-11',
        type: 'EXPENSE',
        amount: { amount: -1200 },
        payee: 'Cafe',
      }),
      tx({
        id: 'dup-b',
        date: '2025-04-11',
        type: 'EXPENSE',
        amount: { amount: -1200 },
        payee: 'Cafe',
      }),
    ];

    const anomalies = detectReportAnomalies(
      transactions,
      categories,
      accounts,
      ['category-spend', 'merchant-spike', 'duplicates'],
      new Date('2025-04-15T12:00:00Z'),
    );

    expect(anomalies.some((anomaly) => anomaly.module === 'category-spend')).toBe(true);
    expect(anomalies.some((anomaly) => anomaly.module === 'duplicates')).toBe(true);
  });
});
