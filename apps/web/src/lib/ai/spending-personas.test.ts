// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { Transaction } from '../../kmp/bridge';
import { assignSpendingPersonas, buildMonthlyFeatureVectors } from './spending-personas';

const sync = {
  createdAt: '2025-01-01T12:00:00Z',
  updatedAt: '2025-01-01T12:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function tx(
  id: string,
  date: string,
  type: Transaction['type'],
  amount: number,
  recurring = false,
): Transaction {
  return {
    ...sync,
    id,
    householdId: 'h1',
    accountId: 'a1',
    categoryId: 'entertainment',
    status: 'CLEARED',
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: recurring ? 'Subscription' : 'Cafe',
    note: null,
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: recurring,
    recurringRuleId: recurring ? 'r1' : null,
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
    counterpartyName: recurring ? 'Subscription' : 'Cafe',
    counterpartyAccountId: null,
    date,
    type,
    amount: { amount },
  };
}

describe('spending personas', () => {
  it('extracts monthly feature vectors from spending, timing, and income', () => {
    const vectors = buildMonthlyFeatureVectors([
      tx('i1', '2025-01-03', 'INCOME', 100_000),
      tx('e1', '2025-01-04', 'EXPENSE', 10_000),
      tx('e2', '2025-01-11', 'EXPENSE', 10_000, true),
    ]);

    expect(vectors[0].month).toBe('2025-01');
    expect(vectors[0].weekendSpendShare).toBe(1);
    expect(vectors[0].recurringSpendShare).toBe(0.5);
  });

  it('assigns deterministic persona labels with evidence', () => {
    const transactions = [
      tx('i1', '2025-01-03', 'INCOME', 100_000),
      tx('e1', '2025-01-04', 'EXPENSE', 10_000, true),
      tx('e2', '2025-01-11', 'EXPENSE', 10_000, true),
      tx('i2', '2025-02-03', 'INCOME', 100_000),
      tx('e3', '2025-02-08', 'EXPENSE', 20_000, true),
      tx('e4', '2025-02-15', 'EXPENSE', 20_000, true),
    ];

    const first = assignSpendingPersonas(transactions);
    const second = assignSpendingPersonas(transactions);

    expect(first.current?.label).toBe('subscription-optimizer');
    expect(second.current?.label).toBe(first.current?.label);
    expect(first.current?.evidence.length).toBeGreaterThan(0);
  });

  it('returns low-data behavior for sparse history', () => {
    const result = assignSpendingPersonas([tx('e1', '2025-01-04', 'EXPENSE', 10_000)]);

    expect(result.status).toBe('low-data');
    expect(result.current).toBeUndefined();
  });
});
