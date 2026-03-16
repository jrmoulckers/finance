// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAccounts } from '../hooks/useAccounts';
import { useCategories } from '../hooks/useCategories';
import { useTransactions } from '../hooks/useTransactions';

import { TransactionsPage } from './TransactionsPage';

// Mock each hook file individually — the page imports from the individual
// paths, not the barrel, so the barrel mock would not intercept them.
vi.mock('../hooks/useTransactions', () => ({ useTransactions: vi.fn() }));
vi.mock('../hooks/useCategories', () => ({ useCategories: vi.fn() }));
vi.mock('../hooks/useAccounts', () => ({ useAccounts: vi.fn() }));

// TransactionForm renders unconditionally and calls useDatabase internally.
// Stub it out so the test has no provider dependency while still allowing
// the page to surface the open state in interaction tests.
vi.mock('../components/forms', () => ({
  TransactionForm: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? (
      <div role="dialog" aria-label="Transaction form">
        Transaction form
      </div>
    ) : null,
}));

const mockedUseTransactions = vi.mocked(useTransactions);
const mockedUseCategories = vi.mocked(useCategories);
const mockedUseAccounts = vi.mocked(useAccounts);
const refreshTransactionsMock = vi.fn();
const createTransactionMock = vi.fn();
const updateTransactionMock = vi.fn();
const deleteTransactionMock = vi.fn();
const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

describe('TransactionsPage', () => {
  beforeEach(() => {
    refreshTransactionsMock.mockReset();
    createTransactionMock.mockReset();
    updateTransactionMock.mockReset();
    deleteTransactionMock.mockReset();
    deleteTransactionMock.mockReturnValue(true);

    mockedUseTransactions.mockReturnValue({
      transactions: [
        {
          id: 'transaction-1',
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
        {
          id: 'transaction-2',
          householdId: 'household-1',
          accountId: 'account-1',
          categoryId: 'category-income',
          type: 'INCOME',
          status: 'CLEARED',
          amount: { amount: 450000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          payee: 'Monthly Salary',
          note: null,
          date: '2025-03-06',
          transferAccountId: null,
          transferTransactionId: null,
          isRecurring: false,
          recurringRuleId: null,
          tags: [],
          ...syncMetadata,
        },
        {
          id: 'transaction-3',
          householdId: 'household-1',
          accountId: 'account-1',
          categoryId: 'category-utilities',
          type: 'EXPENSE',
          status: 'CLEARED',
          amount: { amount: 12400 },
          currency: { code: 'USD', decimalPlaces: 2 },
          payee: 'Electric Bill',
          note: null,
          date: '2025-03-05',
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
      createTransaction: createTransactionMock,
      updateTransaction: updateTransactionMock,
      deleteTransaction: deleteTransactionMock,
    });
    mockedUseCategories.mockReturnValue({
      categories: [
        {
          id: 'category-food',
          householdId: 'household-1',
          name: 'Food',
          icon: 'utensils',
          color: '#16A34A',
          parentId: null,
          isIncome: false,
          isSystem: false,
          sortOrder: 1,
          ...syncMetadata,
        },
        {
          id: 'category-income',
          householdId: 'household-1',
          name: 'Income',
          icon: 'wallet',
          color: '#059669',
          parentId: null,
          isIncome: true,
          isSystem: true,
          sortOrder: 2,
          ...syncMetadata,
        },
        {
          id: 'category-utilities',
          householdId: 'household-1',
          name: 'Utilities',
          icon: 'bolt',
          color: '#7C3AED',
          parentId: null,
          isIncome: false,
          isSystem: false,
          sortOrder: 3,
          ...syncMetadata,
        },
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
      createCategory: vi.fn(),
      updateCategory: vi.fn(),
      deleteCategory: vi.fn(),
    });
    mockedUseAccounts.mockReturnValue({
      accounts: [
        {
          id: 'account-1',
          householdId: 'household-1',
          name: 'Checking',
          type: 'CHECKING',
          currency: { code: 'USD', decimalPlaces: 2 },
          currentBalance: { amount: 520000 },
          isArchived: false,
          sortOrder: 1,
          icon: 'bank',
          color: '#2563EB',
          ...syncMetadata,
        },
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
      createAccount: vi.fn(),
      updateAccount: vi.fn(),
      deleteAccount: vi.fn(),
    });
  });

  it('renders without crashing', () => {
    render(<TransactionsPage />);
    expect(screen.getByText('Transactions')).toBeInTheDocument();
  });

  it('displays the search input', () => {
    render(<TransactionsPage />);
    expect(screen.getByRole('searchbox', { name: /search transactions/i })).toBeInTheDocument();
  });

  it('displays category filter chips', () => {
    render(<TransactionsPage />);
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Food' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Income' })).toBeInTheDocument();
  });

  it('displays transaction descriptions', () => {
    render(<TransactionsPage />);
    expect(screen.getByText('Grocery Store')).toBeInTheDocument();
    expect(screen.getByText('Monthly Salary')).toBeInTheDocument();
    expect(screen.getByText('Electric Bill')).toBeInTheDocument();
  });

  it('displays edit and delete actions for each transaction', () => {
    render(<TransactionsPage />);
    expect(screen.getByRole('button', { name: 'Edit Grocery Store' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Grocery Store' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Monthly Salary' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Electric Bill' })).toBeInTheDocument();
  });

  it('shows edit and delete buttons for each transaction', () => {
    render(<TransactionsPage />);

    expect(screen.getAllByRole('button', { name: /^edit /i })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: /^delete /i })).toHaveLength(3);
  });

  it('clicking edit opens the form', () => {
    render(<TransactionsPage />);

    fireEvent.click(screen.getByRole('button', { name: /edit grocery store/i }));

    expect(screen.getByRole('dialog', { name: /transaction form/i })).toBeInTheDocument();
  });

  it('clicking delete opens ConfirmDialog', () => {
    render(<TransactionsPage />);

    fireEvent.click(screen.getByRole('button', { name: /delete grocery store/i }));

    expect(screen.getByRole('alertdialog', { name: /delete transaction/i })).toBeInTheDocument();
    expect(
      screen.getByText(/are you sure you want to delete\s+"?grocery store"?/i),
    ).toBeInTheDocument();
  });

  it('confirming delete calls deleteTransaction', () => {
    render(<TransactionsPage />);

    fireEvent.click(screen.getByRole('button', { name: /delete grocery store/i }));

    const dialog = screen.getByRole('alertdialog', { name: /delete transaction/i });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(deleteTransactionMock).toHaveBeenCalledWith('transaction-1');
  });
});
