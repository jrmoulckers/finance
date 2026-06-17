// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { WarrantyForm } from './WarrantyForm';
import { clearWarrantyEntries, getWarrantyEntry } from '../../lib/warranty/tracker';
import type { Transaction } from '../../kmp/bridge';

function createTransaction(): Transaction {
  return {
    id: 'transaction-1',
    householdId: 'household-1',
    accountId: 'account-1',
    categoryId: 'category-tech',
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: -89999 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: 'Amazon',
    note: 'Tablet',
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

describe('WarrantyForm', () => {
  beforeEach(() => {
    localStorage.clear();
    clearWarrantyEntries();
  });

  it('prefills the suggested return date and saves warranty details', () => {
    render(<WarrantyForm transaction={createTransaction()} categoryName="Electronics" />);

    const returnWindowField = screen.getByLabelText('Return window ends') as HTMLInputElement;
    const notesField = screen.getByLabelText('Notes');

    expect(returnWindowField.value).toBe('2025-05-31');

    fireEvent.change(notesField, { target: { value: 'Keep original charger in the box.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save warranty' }));

    expect(screen.getByRole('status')).toHaveTextContent('Warranty details saved.');
    expect(getWarrantyEntry('transaction-1')?.notes).toBe('Keep original charger in the box.');
  });

  it('removes existing tracking details', () => {
    render(<WarrantyForm transaction={createTransaction()} categoryName="Electronics" />);

    fireEvent.click(screen.getByRole('button', { name: 'Save warranty' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove tracking' }));

    expect(screen.getByRole('status')).toHaveTextContent('Warranty details removed.');
    expect(getWarrantyEntry('transaction-1')).toBeNull();
  });
});
