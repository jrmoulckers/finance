// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ReturnWindowBadge } from './ReturnWindowBadge';
import { addDays, todayLocalDate } from '../../lib/warranty';
import {
  buildWarrantyDraftFromTransaction,
  clearWarrantyEntries,
  saveWarrantyEntry,
} from '../../lib/warranty/tracker';
import type { Transaction } from '../../kmp/bridge';

function createTransaction(): Transaction {
  return {
    id: 'transaction-1',
    householdId: 'household-1',
    accountId: 'account-1',
    categoryId: 'category-tech',
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: -25000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: 'Amazon',
    note: 'Headphones',
    date: todayLocalDate(),
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

describe('ReturnWindowBadge', () => {
  beforeEach(() => {
    localStorage.clear();
    clearWarrantyEntries();
  });

  it('shows remaining return days for tracked purchases', () => {
    const transaction = createTransaction();
    saveWarrantyEntry(
      buildWarrantyDraftFromTransaction(transaction, {
        returnWindowEndDate: addDays(todayLocalDate(), 2),
      }),
    );

    render(<ReturnWindowBadge transaction={transaction} />);

    expect(screen.getByText(/2 days left to return/i, { selector: 'span' })).toBeInTheDocument();
  });

  it('shows closed status when the return window has passed', () => {
    const transaction = createTransaction();
    saveWarrantyEntry(
      buildWarrantyDraftFromTransaction(transaction, {
        returnWindowEndDate: addDays(todayLocalDate(), -1),
      }),
    );

    render(<ReturnWindowBadge transaction={transaction} />);

    expect(screen.getByText(/return window closed/i, { selector: 'span' })).toBeInTheDocument();
  });
});
