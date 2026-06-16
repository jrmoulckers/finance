// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  buildTaxReserveSummary,
  calculateNetSelfEmploymentIncomeCents,
  calculateRecommendedTaxReserveCents,
  getNextQuarterlyTaxDueDate,
} from './tax-reserve';
import type { Account, Transaction } from '../kmp/bridge';

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function account(id: string, purpose: Account['purpose']): Account {
  return {
    id,
    householdId: 'household-1',
    name: id,
    type: 'CHECKING',
    purpose,
    currency: { code: 'USD', decimalPlaces: 2 },
    currentBalance: { amount: 0 },
    isArchived: false,
    sortOrder: 0,
    icon: null,
    color: null,
    ...syncMetadata,
  };
}

function transaction(input: {
  id: string;
  accountId: string;
  type: Transaction['type'];
  amount: number;
  date: string;
  status?: Transaction['status'];
}): Transaction {
  return {
    id: input.id,
    householdId: 'household-1',
    accountId: input.accountId,
    categoryId: null,
    type: input.type,
    status: input.status ?? 'CLEARED',
    amount: { amount: input.amount },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: null,
    note: null,
    date: input.date,
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
    ...syncMetadata,
  };
}

describe('tax reserve calculations', () => {
  it('calculates recommended reserve from net business income', () => {
    const accounts = [account('business', 'business'), account('personal', 'personal')];
    const transactions = [
      transaction({
        id: 'income',
        accountId: 'business',
        type: 'INCOME',
        amount: 500000,
        date: '2025-03-06',
      }),
      transaction({
        id: 'expense',
        accountId: 'business',
        type: 'EXPENSE',
        amount: 75000,
        date: '2025-03-07',
      }),
      transaction({
        id: 'personal-income',
        accountId: 'personal',
        type: 'INCOME',
        amount: 250000,
        date: '2025-03-08',
      }),
      transaction({
        id: 'voided',
        accountId: 'business',
        type: 'INCOME',
        amount: 100000,
        date: '2025-03-09',
        status: 'VOID',
      }),
    ];

    const netIncome = calculateNetSelfEmploymentIncomeCents(transactions, accounts, {
      startDate: '2025-03-01',
      endDate: '2025-03-31',
    });

    expect(netIncome).toBe(425000);
    expect(calculateRecommendedTaxReserveCents(netIncome, 0.28)).toBe(119000);
  });

  it('builds monthly and quarterly guidance with bucket shortfall', () => {
    const accounts = [account('business', 'business')];
    const transactions = [
      transaction({
        id: 'jan',
        accountId: 'business',
        type: 'INCOME',
        amount: 300000,
        date: '2025-01-20',
      }),
      transaction({
        id: 'mar',
        accountId: 'business',
        type: 'INCOME',
        amount: 500000,
        date: '2025-03-06',
      }),
    ];

    const summary = buildTaxReserveSummary({
      currentMonthTransactions: transactions,
      quarterTransactions: transactions,
      accounts,
      settings: { rate: 0.28, bucketBalanceCents: 100000 },
      asOf: new Date(2025, 2, 10),
    });

    expect(summary.currentMonthNetIncomeCents).toBe(500000);
    expect(summary.currentMonthRecommendedCents).toBe(140000);
    expect(summary.quarterRecommendedCents).toBe(224000);
    expect(summary.recommendedPaymentCents).toBe(124000);
  });

  it('uses rate breakdown, estimated payments, and tagged mixed-account income', () => {
    const accounts = [account('personal', 'personal')];
    const taggedIncome = {
      ...transaction({
        id: 'client',
        accountId: 'personal',
        type: 'INCOME',
        amount: 600000,
        date: '2025-03-06',
      }),
      customFields: { 'tax.selfEmploymentIncome': 'true' },
    };

    const summary = buildTaxReserveSummary({
      currentMonthTransactions: [taggedIncome],
      quarterTransactions: [taggedIncome],
      accounts,
      settings: {
        rate: 0.28,
        federalRate: 0.18,
        stateRate: 0.05,
        selfEmploymentRate: 0.153,
        bucketBalanceCents: 50000,
      },
      estimatedPayments: [
        {
          id: 'q1-payment',
          taxYear: 2025,
          quarter: 'Q1',
          paidDate: '2025-03-20',
          amountCents: 75000,
        },
      ],
      asOf: new Date(2025, 2, 10),
    });

    expect(summary.rate).toBeCloseTo(0.383);
    expect(summary.quarterRecommendedCents).toBe(229800);
    expect(summary.reserveShortfallCents).toBe(179800);
    expect(summary.quarterPaidCents).toBe(75000);
    expect(summary.remainingRecommendedPaymentCents).toBe(104800);
    expect(summary.paymentPeriodLabel).toBe('Q1 2025: 2025-01-01 through 2025-03-31');
    expect(summary.dueDateStatus).toBe('future');
  });
});

describe('quarterly estimated tax due dates', () => {
  it('uses Apr 15, Jun 15, Sep 15, and Jan 15 due dates', () => {
    expect(getNextQuarterlyTaxDueDate(new Date(2025, 1, 1))).toMatchObject({
      quarter: 'Q1',
      taxYear: 2025,
      periodStart: '2025-01-01',
      periodEnd: '2025-03-31',
    });
    expect(getNextQuarterlyTaxDueDate(new Date(2025, 3, 16))).toMatchObject({
      quarter: 'Q2',
      taxYear: 2025,
      periodStart: '2025-04-01',
      periodEnd: '2025-05-31',
    });
    expect(getNextQuarterlyTaxDueDate(new Date(2025, 5, 16))).toMatchObject({
      quarter: 'Q3',
      taxYear: 2025,
      periodStart: '2025-06-01',
      periodEnd: '2025-08-31',
    });
  });

  it('rolls Q4 into Jan 15 of the next year', () => {
    const dueDate = getNextQuarterlyTaxDueDate(new Date(2025, 11, 20));

    expect(dueDate).toMatchObject({
      quarter: 'Q4',
      taxYear: 2025,
      periodStart: '2025-09-01',
      periodEnd: '2025-12-31',
    });
    expect(dueDate.dueDate).toEqual(new Date(2026, 0, 15));
  });

  it('treats early January as the previous tax year Q4 estimate', () => {
    const dueDate = getNextQuarterlyTaxDueDate(new Date(2026, 0, 10));

    expect(dueDate).toMatchObject({ quarter: 'Q4', taxYear: 2025 });
    expect(dueDate.dueDate).toEqual(new Date(2026, 0, 15));
  });
});
