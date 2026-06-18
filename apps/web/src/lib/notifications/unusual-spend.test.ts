// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { Transaction } from '../../kmp/bridge';
import { detectScamAlerts } from './scam-alerts';
import {
  buildUnusualSpendNotifications,
  recordUnusualSpendReview,
  summarizeUnusualSpendReviews,
} from './unusual-spend';

const syncMetadata = {
  createdAt: '2025-03-01T10:00:00Z',
  updatedAt: '2025-03-01T10:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn-1',
    householdId: 'household-1',
    accountId: 'account-1',
    categoryId: 'category-general',
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: 2500 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: 'Grocery Store',
    note: null,
    date: '2025-03-01',
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
    ...overrides,
  };
}

describe('buildUnusualSpendNotifications', () => {
  it('uses existing scam alert rules and adds review actions', () => {
    const notifications = buildUnusualSpendNotifications([
      makeTransaction({ id: 'history-1', payee: 'Known Store', createdAt: '2025-03-01T10:00:00Z' }),
      makeTransaction({ id: 'new-1', payee: 'New Merchant', createdAt: '2025-03-02T10:00:00Z' }),
    ]);

    expect(notifications.some((notification) => notification.type === 'scam_check')).toBe(true);
    expect(notifications[0]?.message).toContain('mark it recognized');
  });

  it('suppresses exact alerts after a review outcome', () => {
    const transactions = [
      makeTransaction({ id: 'history-1', payee: 'Known Store', createdAt: '2025-03-01T10:00:00Z' }),
      makeTransaction({ id: 'new-1', payee: 'New Merchant', createdAt: '2025-03-02T10:00:00Z' }),
    ];
    const alert = detectScamAlerts(transactions).find(
      (candidate) => candidate.rule === 'new-merchant',
    );
    expect(alert).toBeDefined();

    const notifications = buildUnusualSpendNotifications(transactions, {
      reviews:
        alert === undefined
          ? []
          : [recordUnusualSpendReview(alert, 'recognized', '2025-03-02T11:00:00Z')],
    });

    expect(notifications.some((notification) => notification.id === alert?.id)).toBe(false);
  });

  it('summarizes feedback for sensitivity tuning', () => {
    const alert = detectScamAlerts([
      makeTransaction({ id: 'history-1', payee: 'Known Store', createdAt: '2025-03-01T10:00:00Z' }),
      makeTransaction({ id: 'new-1', payee: 'New Merchant', createdAt: '2025-03-02T10:00:00Z' }),
    ])[0];
    expect(alert).toBeDefined();

    const summary = summarizeUnusualSpendReviews(
      alert === undefined ? [] : [recordUnusualSpendReview(alert, 'not_mine')],
    );

    expect(summary.not_mine).toBe(1);
    expect(summary.recognized).toBe(0);
  });
});
