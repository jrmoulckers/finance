// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for cash flow analytics calculation utilities.
 *
 * References: issue #1587
 */

import { describe, it, expect } from 'vitest';
import {
  dateToMonth,
  generateMonthRange,
  computeMonthlyAggregates,
  computeCashFlowSummary,
  computeIncomeSources,
  exportCashFlowCsv,
} from './cash-flow';
import type { Transaction, Category } from '../../kmp/bridge';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTx(opts: {
  id?: string;
  date: string;
  type: 'INCOME' | 'EXPENSE';
  amountCents: number;
  categoryId?: string;
  payee?: string;
}): Transaction {
  return {
    id: opts.id ?? crypto.randomUUID(),
    householdId: 'hh-1',
    accountId: 'acct-1',
    categoryId: opts.categoryId ?? null,
    type: opts.type,
    status: 'CLEARED',
    amount: { amount: opts.amountCents } as Transaction['amount'],
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: opts.payee ?? null,
    note: null,
    date: opts.date,
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
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  } as Transaction;
}

const categories: Category[] = [
  {
    id: 'cat-salary',
    householdId: 'hh-1',
    name: 'Salary',
    icon: null,
    color: null,
    parentId: null,
    sortOrder: 0,
    isIncome: true,
    isSystem: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  },
  {
    id: 'cat-freelance',
    householdId: 'hh-1',
    name: 'Freelance',
    icon: null,
    color: null,
    parentId: null,
    sortOrder: 1,
    isIncome: true,
    isSystem: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dateToMonth', () => {
  it('extracts YYYY-MM from an ISO date', () => {
    expect(dateToMonth('2024-03-15')).toBe('2024-03');
  });

  it('handles single-digit months', () => {
    expect(dateToMonth('2024-01-01')).toBe('2024-01');
  });
});

describe('generateMonthRange', () => {
  it('generates the correct number of months', () => {
    const months = generateMonthRange(6, new Date(2024, 5, 15)); // June 2024
    expect(months).toHaveLength(6);
    expect(months[0]).toBe('2024-01');
    expect(months[5]).toBe('2024-06');
  });

  it('handles year boundary', () => {
    const months = generateMonthRange(3, new Date(2024, 1, 1)); // Feb 2024
    expect(months).toEqual(['2023-12', '2024-01', '2024-02']);
  });
});

describe('computeMonthlyAggregates', () => {
  it('aggregates income and expenses by month', () => {
    const txns = [
      makeTx({ date: '2024-01-05', type: 'INCOME', amountCents: 500000 }),
      makeTx({ date: '2024-01-10', type: 'EXPENSE', amountCents: -200000 }),
      makeTx({ date: '2024-02-05', type: 'INCOME', amountCents: 500000 }),
      makeTx({ date: '2024-02-15', type: 'EXPENSE', amountCents: -150000 }),
    ];

    const result = computeMonthlyAggregates(txns, ['2024-01', '2024-02']);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      month: '2024-01',
      income: 500000,
      expenses: 200000,
      netIncome: 300000,
    });
    expect(result[1]).toEqual({
      month: '2024-02',
      income: 500000,
      expenses: 150000,
      netIncome: 350000,
    });
  });

  it('fills months with no data as zeroes', () => {
    const result = computeMonthlyAggregates([], ['2024-01', '2024-02']);
    expect(result[0].income).toBe(0);
    expect(result[0].expenses).toBe(0);
    expect(result[0].netIncome).toBe(0);
  });
});

describe('computeCashFlowSummary', () => {
  it('computes correct averages and totals', () => {
    const aggregates = [
      { month: '2024-01', income: 500000, expenses: 300000, netIncome: 200000 },
      { month: '2024-02', income: 600000, expenses: 400000, netIncome: 200000 },
    ];

    const summary = computeCashFlowSummary(aggregates);

    expect(summary.totalIncome).toBe(1100000);
    expect(summary.totalExpenses).toBe(700000);
    expect(summary.totalNetIncome).toBe(400000);
    expect(summary.averageMonthlyIncome).toBe(550000);
    expect(summary.averageMonthlyExpenses).toBe(350000);
    expect(summary.monthCount).toBe(2);
  });

  it('handles empty aggregates', () => {
    const summary = computeCashFlowSummary([]);
    expect(summary.monthCount).toBe(0);
    expect(summary.totalIncome).toBe(0);
  });
});

describe('computeIncomeSources', () => {
  it('groups income by category', () => {
    const txns = [
      makeTx({ date: '2024-01-05', type: 'INCOME', amountCents: 500000, categoryId: 'cat-salary' }),
      makeTx({
        date: '2024-01-15',
        type: 'INCOME',
        amountCents: 100000,
        categoryId: 'cat-freelance',
      }),
      makeTx({ date: '2024-01-20', type: 'EXPENSE', amountCents: -200000 }), // ignored
    ];

    const sources = computeIncomeSources(txns, categories);

    expect(sources).toHaveLength(2);
    expect(sources[0].categoryName).toBe('Salary');
    expect(sources[0].amount).toBe(500000);
    expect(sources[1].categoryName).toBe('Freelance');
    expect(sources[1].amount).toBe(100000);
  });

  it('handles uncategorized income', () => {
    const txns = [makeTx({ date: '2024-01-05', type: 'INCOME', amountCents: 100000 })];

    const sources = computeIncomeSources(txns, []);
    expect(sources[0].categoryName).toBe('Uncategorized');
  });
});

describe('exportCashFlowCsv', () => {
  it('generates valid CSV', () => {
    const aggregates = [{ month: '2024-01', income: 500000, expenses: 300000, netIncome: 200000 }];

    const csv = exportCashFlowCsv(aggregates);

    expect(csv).toContain('Month,Income,Expenses,Net Income');
    expect(csv).toContain('2024-01,5000.00,3000.00,2000.00');
  });
});
