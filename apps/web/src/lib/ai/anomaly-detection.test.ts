// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { Transaction } from '../../kmp/bridge';
import { detectFinancialAnomalies } from './anomaly-detection';

const sync = {
  createdAt: '2025-01-01T12:00:00Z',
  updatedAt: '2025-01-01T12:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function tx(
  overrides: Partial<Transaction> & { id: string; date: string; amount: { amount: number } },
): Transaction {
  return {
    ...sync,
    householdId: 'h1',
    accountId: 'a1',
    categoryId: 'food',
    type: 'EXPENSE',
    status: 'CLEARED',
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: 'Grocery',
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
    counterpartyName: 'Grocery',
    counterpartyAccountId: null,
    ...overrides,
  };
}

describe('detectFinancialAnomalies', () => {
  it('detects category outliers with severity and examples', () => {
    const transactions = Array.from({ length: 6 }, (_, index) =>
      tx({
        id: `base-${index}`,
        date: `2025-01-${String(index + 1).padStart(2, '0')}`,
        amount: { amount: 2_000 },
      }),
    );
    transactions.push(tx({ id: 'outlier', date: '2025-01-10', amount: { amount: 30_000 } }));

    const result = detectFinancialAnomalies(transactions);

    expect(result.some((item) => item.kind === 'category-outlier')).toBe(true);
    expect(result[0].confidence).toBeGreaterThan(0.45);
    expect(result[0].comparableExamples.length).toBeGreaterThan(0);
  });

  it('detects velocity spikes but ignores transfers, income, and voided transactions', () => {
    const transactions = [
      tx({ id: 'transfer', date: '2025-01-01', type: 'TRANSFER', amount: { amount: 99_999 } }),
      tx({ id: 'income', date: '2025-01-01', type: 'INCOME', amount: { amount: 99_999 } }),
      tx({ id: 'void', date: '2025-01-01', status: 'VOID', amount: { amount: 99_999 } }),
      ...Array.from({ length: 4 }, (_, index) =>
        tx({
          id: `charge-${index}`,
          date: '2025-01-02',
          amount: { amount: 1_000 },
          customFields: { transactionAt: `2025-01-02T12:0${index}:00Z` },
        }),
      ),
    ];

    const result = detectFinancialAnomalies(transactions);

    expect(result.some((item) => item.kind === 'velocity-spike')).toBe(true);
    expect(result.flatMap((item) => item.transactionIds)).not.toContain('void');
  });

  it('uses feedback to suppress expected or dismissed findings', () => {
    const transactions = Array.from({ length: 6 }, (_, index) =>
      tx({
        id: `base-${index}`,
        date: `2025-01-${String(index + 1).padStart(2, '0')}`,
        amount: { amount: 2_000 },
      }),
    );
    transactions.push(tx({ id: 'outlier', date: '2025-01-10', amount: { amount: 30_000 } }));

    const result = detectFinancialAnomalies(transactions, [
      { transactionId: 'outlier', kind: 'category-outlier', disposition: 'dismissed' },
    ]);

    expect(result.some((item) => item.id === 'category-outlier-outlier')).toBe(false);
  });

  it('handles sparse history without over-flagging normal spikes', () => {
    const result = detectFinancialAnomalies([
      tx({ id: 'one', date: '2025-01-01', amount: { amount: 2_000 } }),
      tx({ id: 'two', date: '2025-01-02', amount: { amount: 10_000 } }),
    ]);

    expect(result.some((item) => item.kind === 'category-outlier')).toBe(false);
  });
});
