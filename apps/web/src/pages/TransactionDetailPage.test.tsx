// SPDX-License-Identifier: MIT

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';

import { useAccounts, useCategories, useTransactions } from '../hooks';
import { TransactionDetailPage } from './TransactionDetailPage';

vi.mock('../hooks', () => ({
  useAccounts: vi.fn(),
  useCategories: vi.fn(),
  useTransactions: vi.fn(),
}));

// TransactionForm renders unconditionally and calls useDatabase internally.
// Stub it out so the test has no provider dependency.
vi.mock('../components/forms', () => ({
  TransactionForm: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? (
      <div role="dialog" aria-label="Transaction form">
        Transaction form
      </div>
    ) : null,
}));

const mockedUseTransactions = vi.mocked(useTransactions);
const mockedUseAccounts = vi.mocked(useAccounts);
const mockedUseCategories = vi.mocked(useCategories);

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

const refreshTransactionsMock = vi.fn();
const updateTransactionMock = vi.fn();
const deleteTransactionMock = vi.fn();

function renderWithRoute(transactionId: string = 'transaction-1') {
  return render(
    <MemoryRouter initialEntries={[`/transactions/${transactionId}`]}>
      <Routes>
        <Route path="/transactions/:id" element={<TransactionDetailPage />} />
        <Route path="/transactions" element={<div>Transactions list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TransactionDetailPage', () => {
  beforeEach(() => {
    localStorage.clear();
    refreshTransactionsMock.mockReset();
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
          note: 'Weekly groceries',
          date: '2025-03-06',
          transferAccountId: null,
          transferTransactionId: null,
          isRecurring: false,
          recurringRuleId: null,
          tags: ['food', 'essentials'],
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
      updateTransaction: updateTransactionMock,
      deleteTransaction: deleteTransactionMock,
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
          id: 'category-household',
          householdId: 'household-1',
          name: 'Household',
          icon: 'home',
          color: '#2563EB',
          parentId: null,
          isIncome: false,
          isSystem: false,
          sortOrder: 2,
          ...syncMetadata,
        },
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
      createCategory: vi.fn(),
      updateCategory: vi.fn(),
      deleteCategory: vi.fn(),
      foodMealTemplate: {
        parentCategory: null,
        subcategories: [],
        missingSubcategoryDefinitions: [],
      },
      ensureFoodMealCategories: vi.fn(),
    });
  });

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  it('shows loading spinner while data is loading', () => {
    mockedUseTransactions.mockReturnValue({
      transactions: [],
      loading: true,
      error: null,
      refresh: refreshTransactionsMock,
      createTransaction: vi.fn(),
      updateTransaction: updateTransactionMock,
      deleteTransaction: deleteTransactionMock,
    });

    renderWithRoute();

    expect(screen.getByRole('status', { name: /loading transaction/i })).toBeInTheDocument();
  });

  it('shows loading spinner while accounts are loading', () => {
    mockedUseAccounts.mockReturnValue({
      accounts: [],
      loading: true,
      error: null,
      refresh: vi.fn(),
      createAccount: vi.fn(),
      updateAccount: vi.fn(),
      deleteAccount: vi.fn(),
    });

    renderWithRoute();

    expect(screen.getByRole('status', { name: /loading transaction/i })).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  it('shows error banner when loading fails', () => {
    mockedUseTransactions.mockReturnValue({
      transactions: [],
      loading: false,
      error: 'Failed to load transactions.',
      refresh: refreshTransactionsMock,
      createTransaction: vi.fn(),
      updateTransaction: updateTransactionMock,
      deleteTransaction: deleteTransactionMock,
    });

    renderWithRoute();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Failed to load transactions.')).toBeInTheDocument();
  });

  it('shows retry button on error', () => {
    mockedUseTransactions.mockReturnValue({
      transactions: [],
      loading: false,
      error: 'Network error',
      refresh: refreshTransactionsMock,
      createTransaction: vi.fn(),
      updateTransaction: updateTransactionMock,
      deleteTransaction: deleteTransactionMock,
    });

    renderWithRoute();

    const retryButton = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryButton);
    expect(refreshTransactionsMock).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Not found state
  // ---------------------------------------------------------------------------

  it('shows not found message when transaction ID does not match', () => {
    renderWithRoute('nonexistent-id');

    expect(screen.getByText('Transaction not found.')).toBeInTheDocument();
  });

  it('shows back link on not found state', () => {
    renderWithRoute('nonexistent-id');

    expect(screen.getByRole('link', { name: /back to transactions/i })).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Data present state
  // ---------------------------------------------------------------------------

  it('renders transaction payee as heading', () => {
    renderWithRoute();

    expect(screen.getByRole('heading', { name: 'Grocery Store' })).toBeInTheDocument();
  });

  it('displays transaction type', () => {
    renderWithRoute();

    expect(screen.getByText('Expense')).toBeInTheDocument();
  });

  it('displays transaction status', () => {
    renderWithRoute();

    expect(screen.getByText('Cleared')).toBeInTheDocument();
  });

  it('displays account name', () => {
    renderWithRoute();

    expect(screen.getByText('Checking')).toBeInTheDocument();
  });

  it('displays category name', () => {
    renderWithRoute();

    expect(screen.getByText('Food')).toBeInTheDocument();
  });

  it('displays split line items with category amounts and notes', () => {
    mockedUseTransactions.mockReturnValue({
      transactions: [
        {
          id: 'transaction-1',
          householdId: 'household-1',
          accountId: 'account-1',
          categoryId: 'category-food',
          splits: [
            {
              id: 'split-1',
              categoryId: 'category-food',
              amount: { amount: 4242 },
              note: 'Groceries',
            },
            {
              id: 'split-2',
              categoryId: 'category-household',
              amount: { amount: 2500 },
              note: 'Cleaning supplies',
            },
          ],
          type: 'EXPENSE',
          status: 'CLEARED',
          amount: { amount: 6742 },
          currency: { code: 'USD', decimalPlaces: 2 },
          payee: 'Grocery Store',
          note: 'Weekly groceries',
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
      updateTransaction: updateTransactionMock,
      deleteTransaction: deleteTransactionMock,
    });

    renderWithRoute();

    expect(screen.getByText('Split (2 lines)')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /split details/i })).toBeInTheDocument();
    expect(screen.getByText('Household')).toBeInTheDocument();
    expect(screen.getByText('Cleaning supplies')).toBeInTheDocument();
  });

  it('displays formatted date', () => {
    renderWithRoute();

    // 2025-03-06 → "Thursday, March 6, 2025"
    expect(screen.getByText(/march 6, 2025/i)).toBeInTheDocument();
  });

  it('displays notes when present', () => {
    renderWithRoute();

    expect(screen.getByText('Weekly groceries')).toBeInTheDocument();
  });

  it('displays tags when present', () => {
    renderWithRoute();

    const tagList = screen.getByRole('list', { name: 'Tags' });
    expect(tagList).toBeInTheDocument();
    expect(tagList.textContent).toContain('food');
    expect(tagList.textContent).toContain('essentials');
  });

  it('has an accessible article for transaction details', () => {
    renderWithRoute();

    expect(screen.getByRole('article', { name: /transaction details/i })).toBeInTheDocument();
  });

  it('shows Uncategorized when category is missing', () => {
    mockedUseTransactions.mockReturnValue({
      transactions: [
        {
          id: 'transaction-1',
          householdId: 'household-1',
          accountId: 'account-1',
          categoryId: null,
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
      updateTransaction: updateTransactionMock,
      deleteTransaction: deleteTransactionMock,
    });

    renderWithRoute();

    expect(screen.getByText('Uncategorized')).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: /edit grocery store/i }));

    expect(screen.getByRole('dialog', { name: /transaction form/i })).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Delete action
  // ---------------------------------------------------------------------------

  it('opens confirm dialog when delete button is clicked', () => {
    renderWithRoute();

    fireEvent.click(screen.getByRole('button', { name: /delete grocery store/i }));

    expect(screen.getByRole('alertdialog', { name: /delete transaction/i })).toBeInTheDocument();
    expect(
      screen.getByText(/are you sure you want to delete\s+"?grocery store"?/i),
    ).toBeInTheDocument();
  });

  it('calls deleteTransaction when deletion is confirmed', () => {
    renderWithRoute();

    fireEvent.click(screen.getByRole('button', { name: /delete grocery store/i }));

    const dialog = screen.getByRole('alertdialog', { name: /delete transaction/i });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(deleteTransactionMock).toHaveBeenCalledWith('transaction-1');
  });

  it('closes confirm dialog when cancel is clicked', () => {
    renderWithRoute();

    fireEvent.click(screen.getByRole('button', { name: /delete grocery store/i }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Additional details section
  // ---------------------------------------------------------------------------

  it('does not show additional details section when all additional fields are null', () => {
    renderWithRoute();

    expect(
      screen.queryByRole('article', { name: /additional transaction details/i }),
    ).not.toBeInTheDocument();
  });

  it('shows additional details section when merchant city is present', () => {
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
          merchantAddress: null,
          merchantCity: 'Austin',
          merchantState: 'TX',
          merchantZip: '78701',
          merchantCountry: 'US',
          externalReferenceId: 'REF-123456',
          statementDescription: 'GROCERY STORE #42',
          customFields: { 'Card Type': 'Visa', Terminal: 'POS-7' },
          extraNotes: 'Imported from Chase CSV',
          counterpartyName: null,
          counterpartyAccountId: null,
          ...syncMetadata,
        },
      ],
      loading: false,
      error: null,
      refresh: refreshTransactionsMock,
      createTransaction: vi.fn(),
      updateTransaction: updateTransactionMock,
      deleteTransaction: deleteTransactionMock,
    });

    renderWithRoute();

    // Section exists but is collapsed by default
    const section = screen.getByRole('article', { name: /additional transaction details/i });
    expect(section).toBeInTheDocument();

    // Expand it
    fireEvent.click(screen.getByRole('button', { name: /additional details/i }));

    // Verify merchant location is formatted
    expect(screen.getByText(/Austin, TX 78701, US/)).toBeInTheDocument();

    // Verify external reference ID
    expect(screen.getByText('REF-123456')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /copy reference id to clipboard/i }),
    ).toBeInTheDocument();

    // Verify statement description
    expect(screen.getByText('GROCERY STORE #42')).toBeInTheDocument();

    // Verify custom fields table
    expect(screen.getByText('Card Type')).toBeInTheDocument();
    expect(screen.getByText('Visa')).toBeInTheDocument();
    expect(screen.getByText('Terminal')).toBeInTheDocument();
    expect(screen.getByText('POS-7')).toBeInTheDocument();

    // Verify extra notes
    expect(screen.getByText('Imported from Chase CSV')).toBeInTheDocument();
  });
});
