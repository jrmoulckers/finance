// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { SpendingVisibilityRule, SpendingVisibilityTransaction } from './spending-visibility';
import {
  buildVisibilityRuleChangeActivity,
  summarizeReconciliationWithVisibility,
  summarizeSharedBudgetSpendingWithVisibility,
} from './spending-visibility-consumers';

const aggregateRule: SpendingVisibilityRule = {
  id: 'rule-aggregate',
  accountId: 'acct-1',
  ownerMemberId: 'owner',
  level: 'AGGREGATE_ONLY',
  updatedAt: '2025-03-01T00:00:00Z',
};

const detailRule: SpendingVisibilityRule = {
  id: 'rule-detail',
  accountId: 'acct-2',
  ownerMemberId: 'owner',
  level: 'SHARED_TRANSACTIONS',
  updatedAt: '2025-03-01T00:00:00Z',
};

const transactions: SpendingVisibilityTransaction[] = [
  {
    id: 'txn-aggregate',
    accountId: 'acct-1',
    ownerMemberId: 'owner',
    amountCents: 12_000,
    date: '2025-03-10',
    categoryId: 'gifts',
    merchant: 'Gift Shop',
    tags: ['birthday'],
    isRecurringBill: false,
  },
  {
    id: 'txn-detail',
    accountId: 'acct-2',
    ownerMemberId: 'owner',
    amountCents: 8_000,
    date: '2025-03-11',
    categoryId: 'food',
    merchant: 'Grocer',
    tags: [],
    isRecurringBill: false,
  },
  {
    id: 'txn-hidden',
    accountId: 'acct-3',
    ownerMemberId: 'owner',
    amountCents: 5_000,
    date: '2025-03-12',
    categoryId: 'medical',
    merchant: 'Clinic',
    tags: [],
    isRecurringBill: false,
  },
];

describe('spending visibility consumers', () => {
  it('keeps aggregate-only transactions in totals without leaking merchant or category details', () => {
    const summary = summarizeSharedBudgetSpendingWithVisibility(
      [aggregateRule, detailRule],
      transactions,
      'partner',
    );

    expect(summary.totalCents).toBe(20_000);
    expect(summary.aggregateOnlyCents).toBe(12_000);
    expect(summary.hiddenTransactionIds).toEqual(['txn-hidden']);
    expect(summary.detailedTransactions).toEqual([
      {
        id: 'txn-detail',
        amountCents: 8_000,
        detailLevel: 'DETAIL',
        categoryId: 'food',
        merchant: 'Grocer',
        label: 'Grocer',
      },
    ]);
  });

  it('routes reconciliation totals through the same redaction decisions', () => {
    const summary = summarizeReconciliationWithVisibility(
      [aggregateRule, detailRule],
      transactions,
      'partner',
    );

    expect(summary).toMatchObject({
      clearedCents: 20_000,
      redactedRowCount: 1,
    });
    expect(summary.detailRows.map((row) => row.id)).toEqual(['txn-detail']);
  });

  it('records visibility rule changes without transaction details', () => {
    const activity = buildVisibilityRuleChangeActivity({
      actorMemberId: 'owner',
      accountId: 'acct-1',
      previousLevel: 'SHARED_TRANSACTIONS',
      nextLevel: 'AGGREGATE_ONLY',
      updatedAt: '2025-03-15T00:00:00Z',
    });

    expect(activity.label).toContain('shared details');
    expect(activity.label).toContain('aggregate totals only');
    expect(activity.label).not.toContain('Gift Shop');
  });
});
