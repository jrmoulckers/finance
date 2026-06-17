// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { WarrantyDashboard } from './WarrantyDashboard';
import { addDays, todayLocalDate } from '../../lib/warranty';
import {
  buildWarrantyDraftFromTransaction,
  clearWarrantyEntries,
  saveWarrantyEntry,
} from '../../lib/warranty/tracker';
import type { Transaction } from '../../kmp/bridge';
import { useTransactions } from '../../hooks';

vi.mock('../../hooks', () => ({
  useTransactions: vi.fn(),
}));

const mockedUseTransactions = vi.mocked(useTransactions);

function createTransaction(id: string, payee: string, amountCents: number): Transaction {
  return {
    id,
    householdId: 'household-1',
    accountId: 'account-1',
    categoryId: 'category-tech',
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: amountCents * -1 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee,
    note: null,
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

describe('WarrantyDashboard', () => {
  beforeEach(() => {
    localStorage.clear();
    clearWarrantyEntries();

    const transactions = [
      createTransaction('transaction-1', 'Amazon', 129999),
      createTransaction('transaction-2', 'Costco', 49999),
    ];

    saveWarrantyEntry(
      buildWarrantyDraftFromTransaction(transactions[0]!, {
        itemName: 'Laptop',
        warrantyExpiryDate: addDays(todayLocalDate(), 4),
        returnWindowEndDate: addDays(todayLocalDate(), 2),
      }),
    );
    saveWarrantyEntry(
      buildWarrantyDraftFromTransaction(transactions[1]!, {
        itemName: 'Vacuum',
        warrantyExpiryDate: addDays(todayLocalDate(), -1),
      }),
    );

    mockedUseTransactions.mockReturnValue({
      transactions,
      loading: false,
      error: null,
      refresh: vi.fn(),
      createTransaction: vi.fn(),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
    });
  });

  it('renders tracked warranty summaries and urgent deadlines', () => {
    render(
      <MemoryRouter>
        <WarrantyDashboard />
      </MemoryRouter>,
    );

    expect(screen.getByText('Warranty & return reminders')).toBeInTheDocument();
    expect(screen.getByText('Covered value')).toBeInTheDocument();
    expect(screen.getAllByText('Laptop').length).toBeGreaterThan(0);
    expect(screen.getByText(/2 days left \(/i)).toBeInTheDocument();
  });

  it('filters the list by status', () => {
    render(
      <MemoryRouter>
        <WarrantyDashboard />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'expired' } });

    const trackedList = screen.getByRole('list', { name: 'Tracked warranties' });
    expect(within(trackedList).getByText('Vacuum')).toBeInTheDocument();
    expect(within(trackedList).queryByText('Laptop')).not.toBeInTheDocument();
  });
});
