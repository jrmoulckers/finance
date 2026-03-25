// SPDX-License-Identifier: MIT

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { useAccounts, useTransactions } from '../hooks';
import { AccountDetailPage } from './AccountDetailPage';

vi.mock('../hooks', () => ({
  useAccounts: vi.fn(),
  useTransactions: vi.fn(),
}));

// AccountForm renders unconditionally and calls useDatabase internally.
// Stub it out so the test has no provider dependency.
vi.mock('../components/forms', () => ({
  AccountForm: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? (
      <div role="dialog" aria-label="Account form">
        Account form
      </div>
    ) : null,
}));

const mockedUseAccounts = vi.mocked(useAccounts);
const mockedUseTransactions = vi.mocked(useTransactions);

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

const refreshMock = vi.fn();
const updateAccountMock = vi.fn();
const deleteAccountMock = vi.fn();
const refreshTransactionsMock = vi.fn();

function renderWithRoute(accountId: string = 'account-1') {
  return render(
    <MemoryRouter initialEntries={[`/accounts/${accountId}`]}>
      <Routes>
        <Route path="/accounts/:id" element={<AccountDetailPage />} />
        <Route path="/accounts" element={<div>Accounts list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AccountDetailPage', () => {
  beforeEach(() => {
    refreshMock.mockReset();
    updateAccountMock.mockReset();
    deleteAccountMock.mockReset();
    refreshTransactionsMock.mockReset();

    mockedUseAccounts.mockReturnValue({
      accounts: [
        {
          id: 'account-1',
          householdId: 'household-1',
          name: 'Primary Checking',
          type: 'CHECKING',
          currency: { code: 'USD', decimalPlaces: 2 },
          currentBalance: { amount: 452000 },
          isArchived: false,
          sortOrder: 1,
          icon: 'bank',
          color: '#2563EB',
          ...syncMetadata,
        },
      ],
      loading: false,
      error: null,
      refresh: refreshMock,
      createAccount: vi.fn(),
      updateAccount: updateAccountMock,
      deleteAccount: deleteAccountMock,
    });

    mockedUseTransactions.mockReturnValue({
      transactions: [
        {
          id: 'tx-1',
          householdId: 'household-1',
          accountId: 'account-1',
          categoryId: 'category-food',
          type: 'EXPENSE',
          status: 'CLEARED',
          amount: { amount: 6742 },
          currency: { code: 'USD', decimalPlaces: 2 },
          payee: 'Grocery Store',
          note: null,
          date: '2025-03-06',
          transferAccountId: null,
          transferTransactionId: null,
          isRecurring: false,
          recurringRuleId: null,
          tags: [],
          ...syncMetadata,
        },
      ],
      loading: false,
      error: null,
      refresh: refreshTransactionsMock,
      createTransaction: vi.fn(),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
    });
  });

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  it('shows loading spinner while accounts are loading', () => {
    mockedUseAccounts.mockReturnValue({
      accounts: [],
      loading: true,
      error: null,
      refresh: refreshMock,
      createAccount: vi.fn(),
      updateAccount: updateAccountMock,
      deleteAccount: deleteAccountMock,
    });

    renderWithRoute();

    expect(screen.getByRole('status', { name: /loading account/i })).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  it('shows error banner when loading fails', () => {
    mockedUseAccounts.mockReturnValue({
      accounts: [],
      loading: false,
      error: 'Failed to load accounts.',
      refresh: refreshMock,
      createAccount: vi.fn(),
      updateAccount: updateAccountMock,
      deleteAccount: deleteAccountMock,
    });

    renderWithRoute();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Failed to load accounts.')).toBeInTheDocument();
  });

  it('shows retry button on error', () => {
    mockedUseAccounts.mockReturnValue({
      accounts: [],
      loading: false,
      error: 'Database error',
      refresh: refreshMock,
      createAccount: vi.fn(),
      updateAccount: updateAccountMock,
      deleteAccount: deleteAccountMock,
    });

    renderWithRoute();

    const retryButton = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryButton);
    expect(refreshMock).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Not found state
  // ---------------------------------------------------------------------------

  it('shows not found message when account ID does not match', () => {
    renderWithRoute('nonexistent-id');

    expect(screen.getByText('Account not found.')).toBeInTheDocument();
  });

  it('shows back link on not found state', () => {
    renderWithRoute('nonexistent-id');

    expect(screen.getByRole('link', { name: /back to accounts/i })).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Data present state
  // ---------------------------------------------------------------------------

  it('renders account name as heading', () => {
    renderWithRoute();

    expect(screen.getByRole('heading', { name: 'Primary Checking' })).toBeInTheDocument();
  });

  it('displays account type', () => {
    renderWithRoute();

    expect(screen.getByText('Checking')).toBeInTheDocument();
  });

  it('displays currency code', () => {
    renderWithRoute();

    expect(screen.getByText('USD')).toBeInTheDocument();
  });

  it('has an accessible article for account details', () => {
    renderWithRoute();

    expect(screen.getByRole('article', { name: /account details/i })).toBeInTheDocument();
  });

  it('renders recent transactions section', () => {
    renderWithRoute();

    expect(screen.getByRole('region', { name: /recent transactions/i })).toBeInTheDocument();
    expect(screen.getByText('Grocery Store')).toBeInTheDocument();
  });

  it('shows empty message when no recent transactions', () => {
    mockedUseTransactions.mockReturnValue({
      transactions: [],
      loading: false,
      error: null,
      refresh: refreshTransactionsMock,
      createTransaction: vi.fn(),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
    });

    renderWithRoute();

    expect(screen.getByText(/no recent transactions/i)).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  it('has back to accounts link', () => {
    renderWithRoute();

    const backLink = screen.getByRole('link', { name: /back to accounts/i });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute('href', '/accounts');
  });

  // ---------------------------------------------------------------------------
  // Edit action
  // ---------------------------------------------------------------------------

  it('opens edit form when edit button is clicked', () => {
    renderWithRoute();

    fireEvent.click(screen.getByRole('button', { name: /edit primary checking/i }));

    expect(screen.getByRole('dialog', { name: /account form/i })).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Delete action
  // ---------------------------------------------------------------------------

  it('opens confirm dialog when delete button is clicked', () => {
    renderWithRoute();

    fireEvent.click(screen.getByRole('button', { name: /delete primary checking/i }));

    expect(screen.getByRole('alertdialog', { name: /delete account/i })).toBeInTheDocument();
    expect(
      screen.getByText(/are you sure you want to delete primary checking/i),
    ).toBeInTheDocument();
  });

  it('calls deleteAccount when deletion is confirmed', () => {
    deleteAccountMock.mockReturnValue(true);

    renderWithRoute();

    fireEvent.click(screen.getByRole('button', { name: /delete primary checking/i }));

    const dialog = screen.getByRole('alertdialog', { name: /delete account/i });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(deleteAccountMock).toHaveBeenCalledWith('account-1');
  });

  it('closes confirm dialog when cancel is clicked', () => {
    renderWithRoute();

    fireEvent.click(screen.getByRole('button', { name: /delete primary checking/i }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
