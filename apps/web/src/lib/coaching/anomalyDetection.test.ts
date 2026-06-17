// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { detectSpendingAnomalies } from './anomalyDetection';
import type { Transaction } from '../../kmp/bridge';

function makeExpense(
  date: string,
  amountCents: number,
  categoryId: string = 'cat-food',
): Transaction {
  return {
    id: `${date}-${amountCents}`,
    householdId: 'hh-1',
    accountId: 'acct-1',
    categoryId,
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: amountCents },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: 'Store',
    note: null,
    date,
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
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  };
}

describe('detectSpendingAnomalies', () => {
  it('flags categories that spike above twice the baseline', () => {
    const anomalies = detectSpendingAnomalies({
      categoriesById: new Map([['cat-food', 'Food']]),
      transactions: [
        makeExpense('2025-03-01', 1000),
        makeExpense('2025-03-03', 1200),
        makeExpense('2025-03-05', 900),
        makeExpense('2025-03-10', 3000),
      ],
      today: '2025-03-10',
    });

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].categoryName).toBe('Food');
    expect(anomalies[0].ratio).toBeGreaterThan(2);
  });

  it('requires enough history before creating a spike alert', () => {
    const anomalies = detectSpendingAnomalies({
      categoriesById: new Map([['cat-food', 'Food']]),
      transactions: [makeExpense('2025-03-07', 1000), makeExpense('2025-03-10', 4000)],
      today: '2025-03-10',
    });

    expect(anomalies).toHaveLength(0);
  });
});
