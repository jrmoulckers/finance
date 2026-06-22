// SPDX-License-Identifier: BUSL-1.1

/**
 * Unit tests for the net worth history reconstruction helper.
 *
 * References: issue #2116
 */

import { describe, expect, it } from 'vitest';
import { buildNetWorthHistorySeries } from './net-worth-history';
import type { Account, Transaction } from '../../kmp/bridge';

function makeAccount(
  overrides: Partial<Account> & { type: Account['type']; balance: number },
): Account {
  return {
    id: overrides.id ?? 'acct-1',
    householdId: 'hh-1',
    name: overrides.name ?? 'Test Account',
    type: overrides.type,
    currency: { code: 'USD', decimalPlaces: 2 },
    currentBalance: { amount: overrides.balance } as Account['currentBalance'],
    isArchived: overrides.isArchived ?? false,
    sortOrder: 0,
    icon: null,
    color: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  } as Account;
}

function makeTransaction(
  overrides: Omit<Partial<Transaction>, 'amount'> & {
    type: Transaction['type'];
    amount: number;
    date: string;
  },
): Transaction {
  return {
    id: overrides.id ?? `txn-${overrides.date}-${overrides.amount}`,
    householdId: 'hh-1',
    accountId: 'acct-1',
    categoryId: null,
    type: overrides.type,
    status: 'CLEARED',
    amount: { amount: overrides.amount } as Transaction['amount'],
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: null,
    note: null,
    date: overrides.date,
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

// Fixed reference date so windows are deterministic.
const NOW = new Date('2026-06-15T12:00:00.000Z');

describe('buildNetWorthHistorySeries', () => {
  it('returns an empty series when months is zero or negative', () => {
    const accounts = [makeAccount({ type: 'CHECKING', balance: 100_000 })];
    expect(buildNetWorthHistorySeries(accounts, [], 0, NOW)).toEqual([]);
    expect(buildNetWorthHistorySeries(accounts, [], -3, NOW)).toEqual([]);
  });

  it('produces one point per requested month, oldest first', () => {
    const accounts = [makeAccount({ type: 'CHECKING', balance: 500_000 })];
    const series = buildNetWorthHistorySeries(accounts, [], 6, NOW);
    expect(series).toHaveLength(6);
    expect(series.every((point) => point.dateIso !== undefined)).toBe(true);
    // The latest window ends at "today".
    expect(series[series.length - 1]!.dateIso).toBe('2026-06-15');
  });

  it('holds net worth flat across months when there are no transactions', () => {
    const accounts = [makeAccount({ type: 'CHECKING', balance: 500_000 })];
    const series = buildNetWorthHistorySeries(accounts, [], 4, NOW);
    expect(series.map((point) => point.netWorthCents)).toEqual([
      500_000, 500_000, 500_000, 500_000,
    ]);
  });

  it('reconstructs earlier net worth by removing later cash flow', () => {
    // Current net worth = 500k. A 100k income posted this month means the
    // prior months sat 100k lower.
    const accounts = [makeAccount({ type: 'CHECKING', balance: 500_000 })];
    const transactions = [makeTransaction({ type: 'INCOME', amount: 100_000, date: '2026-06-10' })];
    const series = buildNetWorthHistorySeries(accounts, transactions, 3, NOW);

    expect(series[series.length - 1]!.netWorthCents).toBe(500_000);
    expect(series[0]!.netWorthCents).toBe(400_000);
    expect(series[1]!.netWorthCents).toBe(400_000);
  });

  it('treats expenses as reducing earlier net worth', () => {
    // A 50k expense this month means prior months were 50k higher.
    const accounts = [makeAccount({ type: 'CHECKING', balance: 200_000 })];
    const transactions = [makeTransaction({ type: 'EXPENSE', amount: 50_000, date: '2026-06-05' })];
    const series = buildNetWorthHistorySeries(accounts, transactions, 2, NOW);

    expect(series[series.length - 1]!.netWorthCents).toBe(200_000);
    expect(series[0]!.netWorthCents).toBe(250_000);
  });

  it('subtracts liability balances from current net worth', () => {
    const accounts = [
      makeAccount({ type: 'CHECKING', balance: 300_000 }),
      makeAccount({ id: 'cc-1', type: 'CREDIT_CARD', balance: 50_000 }),
    ];
    const series = buildNetWorthHistorySeries(accounts, [], 2, NOW);
    expect(series.every((point) => point.netWorthCents === 250_000)).toBe(true);
  });

  it('ignores transfers when rolling net worth backwards', () => {
    const accounts = [makeAccount({ type: 'CHECKING', balance: 500_000 })];
    const transactions = [
      makeTransaction({ type: 'TRANSFER', amount: 100_000, date: '2026-06-09' }),
    ];
    const series = buildNetWorthHistorySeries(accounts, transactions, 3, NOW);
    expect(series.every((point) => point.netWorthCents === 500_000)).toBe(true);
  });
});
