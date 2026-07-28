// SPDX-License-Identifier: MIT

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';

import { useAccountReconciliation, useAccounts, useTransactions } from '../hooks';
import { calculateReconciliationDifference } from '../lib/reconciliation';
import { AccountDetailPage } from './AccountDetailPage';

vi.mock('../hooks', () => ({
  useAccounts: vi.fn(),
  useTransactions: vi.fn(),
  useAccountReconciliation: vi.fn(),
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
const mockedUseAccountReconciliation = vi.mocked(useAccountReconciliation);

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
const closeReconciliationMock = vi.fn();
const refreshReconciliationMock = vi.fn();

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
    closeReconciliationMock.mockReset();
    refreshReconciliationMock.mockReset();

    mockedUseAccounts.mockReturnValue({
      accounts: [
        {
          id: 'account-1',
          householdId: 'household-1',
          name: 'Primary Checking',
          type: 'CHECKING',
          currency: { code: 'USD', decimalPlaces: 2 },
          currentBalance: { amount: 452000 },
          purpose: 'business',
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

    mockedUseAccountReconciliation.mockReturnValue({
      history: [],
      lastReconciliation: null,
      unclearedTransactionCount: 1,
      loading: false,
      error: null,
      refresh: refreshReconciliationMock,
      closeReconciliation: closeReconciliationMock,
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

  it('displays the account purpose', () => {
    renderWithRoute();

    expect(screen.getByText('Business')).toBeInTheDocument();
    expect(screen.getByText('💼 Business')).toBeInTheDocument();
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
  // Reconciliation
  // ---------------------------------------------------------------------------

  it('calculates reconciliation difference from starting balance and checked transactions', () => {
    const result = calculateReconciliationDifference({
      startingBalance: 10000,
      statementEndingBalance: 12500,
      transactions: [
        {
          id: 'income',
          type: 'INCOME',
          status: 'PENDING',
          amount: { amount: 5000 },
          date: '2025-03-01',
        },
        {
          id: 'expense',
          type: 'EXPENSE',
          status: 'PENDING',
          amount: { amount: 2500 },
          date: '2025-03-02',
        },
        {
          id: 'ignored',
          type: 'EXPENSE',
          status: 'PENDING',
          amount: { amount: 9999 },
          date: '2025-03-03',
        },
      ],
      clearedTransactionIds: ['income', 'expense'],
    });

    expect(result).toMatchObject({
      clearedTotal: 2500,
      computedEndingBalance: 12500,
      difference: 0,
      clearedCount: 2,
      canClose: true,
    });
  });

  it('shows per-account reconciliation status and history', () => {
    mockedUseAccountReconciliation.mockReturnValue({
      history: [
        {
          id: 'recon-1',
          accountId: 'account-1',
          householdId: 'household-1',
          statementDate: '2025-02-28',
          statementBalance: { amount: 10000 },
          startingBalance: { amount: 0 },
          clearedTransactionCount: 3,
          transactionIds: ['tx-1', 'tx-2', 'tx-3'],
          createdBy: 'local-user',
          ...syncMetadata,
        },
      ],
      lastReconciliation: {
        id: 'recon-1',
        accountId: 'account-1',
        householdId: 'household-1',
        statementDate: '2025-02-28',
        statementBalance: { amount: 10000 },
        startingBalance: { amount: 0 },
        clearedTransactionCount: 3,
        transactionIds: ['tx-1', 'tx-2', 'tx-3'],
        createdBy: 'local-user',
        ...syncMetadata,
      },
      unclearedTransactionCount: 4,
      loading: false,
      error: null,
      refresh: refreshReconciliationMock,
      closeReconciliation: closeReconciliationMock,
    });

    renderWithRoute();

    expect(screen.getByRole('region', { name: /account reconciliation/i })).toBeInTheDocument();
    expect(screen.getByText(/last reconciled:/i)).toHaveTextContent('Feb 28, 2025');
    expect(screen.getByText('4 transactions uncleared')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /reconciliation history/i })).toHaveTextContent(
      '3 cleared',
    );
  });

  it('closes reconciliation only when the statement difference is zero', () => {
    const closeSnapshot = {
      id: 'recon-2',
      accountId: 'account-1',
      householdId: 'household-1',
      statementDate: '2025-03-31',
      statementBalance: { amount: 12500 },
      startingBalance: { amount: 10000 },
      clearedTransactionCount: 2,
      transactionIds: ['tx-income', 'tx-expense'],
      createdBy: 'local-user',
      ...syncMetadata,
    };
    closeReconciliationMock.mockReturnValue(closeSnapshot);
    mockedUseAccountReconciliation.mockReturnValue({
      history: [],
      lastReconciliation: {
        id: 'recon-1',
        accountId: 'account-1',
        householdId: 'household-1',
        statementDate: '2025-02-28',
        statementBalance: { amount: 10000 },
        startingBalance: { amount: 0 },
        clearedTransactionCount: 1,
        transactionIds: ['tx-old'],
        createdBy: 'local-user',
        ...syncMetadata,
      },
      unclearedTransactionCount: 2,
      loading: false,
      error: null,
      refresh: refreshReconciliationMock,
      closeReconciliation: closeReconciliationMock,
    });
    mockedUseTransactions.mockReturnValue({
      transactions: [
        {
          id: 'tx-income',
          householdId: 'household-1',
          accountId: 'account-1',
          categoryId: null,
          type: 'INCOME',
          status: 'PENDING',
          amount: { amount: 5000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          payee: 'Client payment',
          note: null,
          date: '2025-03-10',
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
          ...syncMetadata,
        },
        {
          id: 'tx-expense',
          householdId: 'household-1',
          accountId: 'account-1',
          categoryId: null,
          type: 'EXPENSE',
          status: 'PENDING',
          amount: { amount: 2500 },
          currency: { code: 'USD', decimalPlaces: 2 },
          payee: 'Office supplies',
          note: null,
          date: '2025-03-12',
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

    renderWithRoute();

    fireEvent.click(screen.getByRole('button', { name: /start reconciliation/i }));
    fireEvent.change(screen.getByLabelText(/statement ending balance/i), {
      target: { value: '125.00' },
    });
    fireEvent.change(screen.getByLabelText(/statement date/i), { target: { value: '2025-03-31' } });

    const finishButton = screen.getByRole('button', { name: /finish\/reconcile/i });
    expect(finishButton).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/cleared client payment/i));
    fireEvent.click(screen.getByLabelText(/cleared office supplies/i));
    expect(finishButton).toBeEnabled();

    fireEvent.click(finishButton);

    expect(closeReconciliationMock).toHaveBeenCalledWith({
      householdId: 'household-1',
      statementDate: '2025-03-31',
      statementBalance: { amount: 12500 },
      startingBalance: { amount: 10000 },
      transactionIds: ['tx-income', 'tx-expense'],
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Reconciliation closed and transactions locked.',
    );
  });

  it('visually marks reconciled transactions as locked in the recent list', () => {
    mockedUseTransactions.mockReturnValue({
      transactions: [
        {
          id: 'tx-locked',
          householdId: 'household-1',
          accountId: 'account-1',
          categoryId: null,
          type: 'INCOME',
          status: 'RECONCILED',
          amount: { amount: 10000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          payee: 'Deposited statement item',
          note: null,
          date: '2025-02-28',
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

    renderWithRoute();

    expect(screen.getByText(/reconciled · locked/i)).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  // Breadcrumbs are consolidated into the shell header (#3667); the detail
  // page no longer renders its own in-page breadcrumb trail.
  it('does not render a duplicate in-page breadcrumb', () => {
    renderWithRoute();

    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
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
    expect(screen.getByText(/this account has 1 transaction/i)).toBeInTheDocument();
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
