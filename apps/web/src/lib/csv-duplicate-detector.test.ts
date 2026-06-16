// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { detectDuplicates, mergeTransactionDetails } from './csv-duplicate-detector';
import type { ValidatedRow } from './csv-import-validator';
import type { Transaction } from '@/kmp/bridge';

function row(overrides: Partial<ValidatedRow['data']> = {}, rowIndex = 1): ValidatedRow {
  return {
    rowIndex,
    warnings: [],
    data: {
      householdId: 'hh-1',
      accountId: 'acc-1',
      type: 'EXPENSE',
      status: 'CLEARED',
      amount: { amount: 1234 },
      date: '2024-02-02',
      payee: 'Coffee Shop',
      note: null,
      ...overrides,
    },
  };
}

function txn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn-1',
    householdId: 'hh-1',
    accountId: 'acc-1',
    categoryId: null,
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: 1234 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: 'Coffee Shop',
    note: null,
    date: '2024-02-02',
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
    ...overrides,
  };
}

describe('detectDuplicates', () => {
  it('prioritizes exact source transaction IDs', () => {
    const matches = detectDuplicates(
      [row({ externalReferenceId: 'FIT-1' } as Partial<ValidatedRow['data']>)],
      [txn({ externalReferenceId: 'FIT-1', date: '2024-01-30', payee: 'Different' })],
    );

    expect(matches[0].matchScore).toBe(1);
    expect(matches[0].matchReasons).toContain('same source transaction id');
  });

  it('detects date-shifted pending and posted transactions', () => {
    const matches = detectDuplicates(
      [row({ date: '2024-02-03', payee: 'Coffee Shop Downtown' })],
      [txn({ date: '2024-02-02', statementDescription: 'COFFEE SHOP DOWNTOWN' })],
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].matchReasons).toContain('posting date within 3 days');
  });

  it('does not match same amount on a different merchant', () => {
    const matches = detectDuplicates([row({ payee: 'Coffee Shop' })], [txn({ payee: 'Book Store' })]);
    expect(matches).toHaveLength(0);
  });

  it('merges complementary import details without overwriting better existing data', () => {
    const merged = mergeTransactionDetails(txn({ note: 'Existing note' }), {
      externalReferenceId: 'FIT-2',
      statementDescription: 'RAW COFFEE SHOP POS',
      note: 'Imported memo',
    });

    expect(merged.note).toBe('Existing note\nImported memo');
    expect(merged.externalReferenceId).toBe('FIT-2');
    expect(merged.statementDescription).toBe('RAW COFFEE SHOP POS');
  });
});
