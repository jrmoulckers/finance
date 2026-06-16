// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { Transaction } from '../../kmp/bridge';
import { findSavingsOpportunities } from './savings-opportunities';

const sync = {
  createdAt: '2025-01-01T12:00:00Z',
  updatedAt: '2025-01-01T12:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function tx(id: string, date: string, amount: number, merchant: string, categoryId = 'shopping'): Transaction {
  return {
    ...sync,
    id,
    householdId: 'h1',
    accountId: 'a1',
    categoryId,
    type: 'EXPENSE',
    status: 'CLEARED',
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: merchant,
    note: null,
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
    counterpartyName: merchant,
    counterpartyAccountId: null,
    date,
    amount: { amount },
  };
}

describe('findSavingsOpportunities', () => {
  it('detects recurring subscriptions and estimates monthly savings', () => {
    const result = findSavingsOpportunities({
      transactions: [
        tx('s1', '2025-01-01', 1_500, 'StreamCo'),
        tx('s2', '2025-02-01', 1_500, 'StreamCo'),
        tx('s3', '2025-03-03', 1_500, 'StreamCo'),
      ],
      asOfDate: '2025-03-15',
      currentBalanceCents: 100_000,
      forecastLowBalanceCents: 90_000,
      safetyBufferCents: 20_000,
    });

    const subscription = result.find((item) => item.kind === 'subscription');
    expect(subscription?.estimateMonthlySavingsCents).toBe(1_500);
    expect(subscription?.confidence).toBeGreaterThan(0.7);
  });

  it('ranks opportunities by impact, confidence, and effort', () => {
    const result = findSavingsOpportunities({
      transactions: [
        tx('s1', '2025-01-01', 1_500, 'StreamCo'),
        tx('s2', '2025-02-01', 1_500, 'StreamCo'),
        tx('s3', '2025-03-03', 1_500, 'StreamCo'),
        tx('f1', '2025-03-05', 15_000, 'Bank maintenance fee', 'fees'),
      ],
      asOfDate: '2025-03-15',
      currentBalanceCents: 200_000,
      forecastLowBalanceCents: 180_000,
      safetyBufferCents: 20_000,
    });

    expect(result[0].rankScore).toBeGreaterThanOrEqual(result[1].rankScore);
  });

  it('keeps safe transfer at zero when low-balance checks fail', () => {
    const result = findSavingsOpportunities({
      transactions: [
        tx('s1', '2025-01-01', 1_500, 'StreamCo'),
        tx('s2', '2025-02-01', 1_500, 'StreamCo'),
        tx('s3', '2025-03-03', 1_500, 'StreamCo'),
      ],
      asOfDate: '2025-03-15',
      currentBalanceCents: 10_000,
      forecastLowBalanceCents: 10_000,
      safetyBufferCents: 20_000,
    });

    expect(result.every((item) => item.safeTransferCents === 0)).toBe(true);
  });

  it('suppresses dismissed opportunities', () => {
    const result = findSavingsOpportunities({
      transactions: [
        tx('s1', '2025-01-01', 1_500, 'StreamCo'),
        tx('s2', '2025-02-01', 1_500, 'StreamCo'),
        tx('s3', '2025-03-03', 1_500, 'StreamCo'),
      ],
      asOfDate: '2025-03-15',
      currentBalanceCents: 100_000,
      dismissedOpportunityIds: ['subscription-streamco'],
    });

    expect(result.some((item) => item.id === 'subscription-streamco')).toBe(false);
  });
});
