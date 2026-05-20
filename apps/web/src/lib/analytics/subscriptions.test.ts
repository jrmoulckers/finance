// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for subscription detection and rationalization utilities.
 *
 * References: issue #1593
 */

import { describe, it, expect } from 'vitest';
import {
  detectCadence,
  toMonthlyCost,
  detectSubscriptions,
  computeSubscriptionSummary,
} from './subscriptions';
import type { Transaction, Category } from '../../kmp/bridge';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTx(opts: {
  id?: string;
  date: string;
  payee: string;
  amountCents: number;
  categoryId?: string;
}): Transaction {
  return {
    id: opts.id ?? crypto.randomUUID(),
    householdId: 'hh-1',
    accountId: 'acct-1',
    categoryId: opts.categoryId ?? null,
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: opts.amountCents } as Transaction['amount'],
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: opts.payee,
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
    id: 'cat-streaming',
    householdId: 'hh-1',
    name: 'Streaming',
    icon: null,
    color: null,
    parentId: null,
    sortOrder: 0,
    isIncome: false,
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

describe('detectCadence', () => {
  it('detects monthly cadence', () => {
    const dates = ['2024-01-15', '2024-02-15', '2024-03-15'];
    expect(detectCadence(dates)).toBe('monthly');
  });

  it('detects weekly cadence', () => {
    const dates = ['2024-01-01', '2024-01-08', '2024-01-15'];
    expect(detectCadence(dates)).toBe('weekly');
  });

  it('detects annual cadence', () => {
    const dates = ['2023-01-15', '2024-01-14'];
    expect(detectCadence(dates)).toBe('annual');
  });

  it('defaults to monthly for single date', () => {
    expect(detectCadence(['2024-01-15'])).toBe('monthly');
  });
});

describe('toMonthlyCost', () => {
  it('converts weekly to monthly', () => {
    // $10/week → $10 * 52 / 12 ≈ $43.33
    expect(toMonthlyCost(1000, 'weekly')).toBe(4333);
  });

  it('returns monthly as-is', () => {
    expect(toMonthlyCost(1500, 'monthly')).toBe(1500);
  });

  it('converts annual to monthly', () => {
    // $120/year → $10/month
    expect(toMonthlyCost(12000, 'annual')).toBe(1000);
  });
});

describe('detectSubscriptions', () => {
  it('detects recurring payees as subscriptions', () => {
    const txns = [
      makeTx({
        date: '2024-01-15',
        payee: 'Netflix',
        amountCents: -1599,
        categoryId: 'cat-streaming',
      }),
      makeTx({
        date: '2024-02-15',
        payee: 'Netflix',
        amountCents: -1599,
        categoryId: 'cat-streaming',
      }),
      makeTx({
        date: '2024-03-15',
        payee: 'Netflix',
        amountCents: -1599,
        categoryId: 'cat-streaming',
      }),
    ];

    const subs = detectSubscriptions(txns, categories);

    expect(subs).toHaveLength(1);
    expect(subs[0].name).toBe('Netflix');
    expect(subs[0].amountCents).toBe(1599);
    expect(subs[0].cadence).toBe('monthly');
    expect(subs[0].categoryName).toBe('Streaming');
    expect(subs[0].transactionCount).toBe(3);
  });

  it('ignores non-recurring payees (1 occurrence)', () => {
    const txns = [makeTx({ date: '2024-01-15', payee: 'One-time Shop', amountCents: -5000 })];

    const subs = detectSubscriptions(txns, categories);
    expect(subs).toHaveLength(0);
  });

  it('ignores highly variable amounts', () => {
    const txns = [
      makeTx({ date: '2024-01-15', payee: 'Variable Store', amountCents: -1000 }),
      makeTx({ date: '2024-02-15', payee: 'Variable Store', amountCents: -5000 }),
      makeTx({ date: '2024-03-15', payee: 'Variable Store', amountCents: -10000 }),
    ];

    const subs = detectSubscriptions(txns, categories);
    expect(subs).toHaveLength(0);
  });
});

describe('computeSubscriptionSummary', () => {
  it('sums active subscriptions correctly', () => {
    const subs = [
      {
        id: 'sub-1',
        name: 'Netflix',
        categoryId: null,
        categoryName: 'Streaming',
        amountCents: 1599,
        cadence: 'monthly' as const,
        monthlyCostCents: 1599,
        annualCostCents: 19188,
        transactionCount: 3,
        lastDate: '2024-03-15',
        status: 'active' as const,
      },
      {
        id: 'sub-2',
        name: 'Spotify',
        categoryId: null,
        categoryName: 'Streaming',
        amountCents: 999,
        cadence: 'monthly' as const,
        monthlyCostCents: 999,
        annualCostCents: 11988,
        transactionCount: 3,
        lastDate: '2024-03-15',
        status: 'active' as const,
      },
    ];

    const summary = computeSubscriptionSummary(subs);

    expect(summary.totalMonthlyCents).toBe(2598);
    expect(summary.totalAnnualCents).toBe(31176);
    expect(summary.activeCount).toBe(2);
  });

  it('excludes cancelled subscriptions from totals', () => {
    const subs = [
      {
        id: 'sub-1',
        name: 'Netflix',
        categoryId: null,
        categoryName: 'Streaming',
        amountCents: 1599,
        cadence: 'monthly' as const,
        monthlyCostCents: 1599,
        annualCostCents: 19188,
        transactionCount: 3,
        lastDate: '2024-03-15',
        status: 'cancelled' as const,
      },
    ];

    const summary = computeSubscriptionSummary(subs);
    expect(summary.totalMonthlyCents).toBe(0);
    expect(summary.cancelledCount).toBe(1);
  });
});
