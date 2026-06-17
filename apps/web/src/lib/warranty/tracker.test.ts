// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildWarrantyDraftFromTransaction,
  clearWarrantyEntries,
  deleteWarrantyEntry,
  getWarrantyEntry,
  loadWarrantyEntries,
  saveWarrantyEntry,
} from './tracker';
import type { Transaction } from '../../kmp/bridge';

function createTransaction(): Transaction {
  return {
    id: 'transaction-1',
    householdId: 'household-1',
    accountId: 'account-1',
    categoryId: 'category-tech',
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: -129999 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: 'Amazon',
    note: 'Laptop',
    date: '2025-05-01',
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
    createdAt: '2025-05-01T00:00:00.000Z',
    updatedAt: '2025-05-01T00:00:00.000Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  };
}

describe('warranty tracker', () => {
  beforeEach(() => {
    localStorage.clear();
    clearWarrantyEntries();
  });

  it('builds drafts from transaction metadata', () => {
    const draft = buildWarrantyDraftFromTransaction(createTransaction());

    expect(draft.itemName).toBe('Laptop');
    expect(draft.amountCents).toBe(129999);
    expect(draft.currencyCode).toBe('USD');
  });

  it('saves and updates entries by transaction id', () => {
    const transaction = createTransaction();
    const first = saveWarrantyEntry(
      buildWarrantyDraftFromTransaction(transaction, {
        warrantyExpiryDate: '2026-05-01',
        returnWindowEndDate: '2025-05-31',
      }),
    );
    const second = saveWarrantyEntry(
      buildWarrantyDraftFromTransaction(transaction, {
        warrantyExpiryDate: '2027-05-01',
        notes: 'Extended coverage',
      }),
    );

    expect(loadWarrantyEntries()).toHaveLength(1);
    expect(first.id).toBe(second.id);
    expect(getWarrantyEntry(transaction.id)?.warrantyExpiryDate).toBe('2027-05-01');
    expect(getWarrantyEntry(transaction.id)?.notes).toBe('Extended coverage');
  });

  it('deletes tracked entries', () => {
    const transaction = createTransaction();
    saveWarrantyEntry(
      buildWarrantyDraftFromTransaction(transaction, { warrantyExpiryDate: '2026-05-01' }),
    );

    expect(deleteWarrantyEntry(transaction.id)).toBe(true);
    expect(loadWarrantyEntries()).toHaveLength(0);
  });
});
