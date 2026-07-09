// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { Transaction, TransactionType } from '../../kmp/bridge';
import { summarizeTransactions } from './summary';

let idCounter = 0;

function makeTransaction(opts: {
  type: TransactionType;
  amount: number;
  currency?: string;
  id?: string;
}): Transaction {
  const { type, amount, currency = 'USD', id } = opts;
  return {
    id: id ?? `txn-${(idCounter += 1)}`,
    householdId: 'household-1',
    accountId: 'account-1',
    categoryId: null,
    type,
    status: 'CLEARED',
    amount: { amount },
    currency: { code: currency, decimalPlaces: 2 },
    payee: 'Payee',
    note: null,
    date: '2025-03-06',
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
    createdAt: '2025-03-06T00:00:00.000Z',
    updatedAt: '2025-03-06T00:00:00.000Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  };
}

describe('summarizeTransactions', () => {
  it('counts every transaction including transfers', () => {
    const summary = summarizeTransactions([
      makeTransaction({ type: 'INCOME', amount: 5000 }),
      makeTransaction({ type: 'EXPENSE', amount: 2000 }),
      makeTransaction({ type: 'TRANSFER', amount: 9999 }),
    ]);
    expect(summary.count).toBe(3);
  });

  it('nets income minus expenses in integer cents', () => {
    const summary = summarizeTransactions([
      makeTransaction({ type: 'INCOME', amount: 5000 }),
      makeTransaction({ type: 'EXPENSE', amount: 2000 }),
      makeTransaction({ type: 'EXPENSE', amount: 500 }),
    ]);
    expect(summary.singleCurrencyNet).toEqual({ currency: 'USD', net: 2500 });
    expect(summary.isMixedCurrency).toBe(false);
  });

  it('treats expense amounts as negative regardless of stored sign', () => {
    const summary = summarizeTransactions([
      makeTransaction({ type: 'EXPENSE', amount: -3000 }),
      makeTransaction({ type: 'INCOME', amount: 1000 }),
    ]);
    expect(summary.singleCurrencyNet).toEqual({ currency: 'USD', net: -2000 });
  });

  it('excludes transfers from the net total', () => {
    const summary = summarizeTransactions([
      makeTransaction({ type: 'INCOME', amount: 1000 }),
      makeTransaction({ type: 'TRANSFER', amount: 50000 }),
    ]);
    expect(summary.singleCurrencyNet).toEqual({ currency: 'USD', net: 1000 });
  });

  it('reports per-currency totals and flags mixed currencies', () => {
    const summary = summarizeTransactions([
      makeTransaction({ type: 'INCOME', amount: 1000, currency: 'USD' }),
      makeTransaction({ type: 'EXPENSE', amount: 400, currency: 'USD' }),
      makeTransaction({ type: 'EXPENSE', amount: 700, currency: 'EUR' }),
    ]);
    expect(summary.isMixedCurrency).toBe(true);
    expect(summary.singleCurrencyNet).toBeNull();
    expect(summary.totalsByCurrency).toEqual([
      { currency: 'EUR', net: -700 },
      { currency: 'USD', net: 600 },
    ]);
  });

  it('returns an empty net when only transfers are present', () => {
    const summary = summarizeTransactions([
      makeTransaction({ type: 'TRANSFER', amount: 1000 }),
      makeTransaction({ type: 'TRANSFER', amount: 2000 }),
    ]);
    expect(summary.count).toBe(2);
    expect(summary.totalsByCurrency).toEqual([]);
    expect(summary.singleCurrencyNet).toBeNull();
    expect(summary.isMixedCurrency).toBe(false);
  });

  it('handles an empty list', () => {
    const summary = summarizeTransactions([]);
    expect(summary).toEqual({
      count: 0,
      totalsByCurrency: [],
      isMixedCurrency: false,
      singleCurrencyNet: null,
    });
  });
});
