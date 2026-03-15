// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
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
// Stub it out so the test has no provider dependency.
vi.mock('../components/forms', () => ({
  TransactionForm: () => null,
}));

const mockedUseTransactions = vi.mocked(useTransactions);
const mockedUseCategories = vi.mocked(useCategories);
const mockedUseAccounts = vi.mocked(useAccounts);
const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

describe('TransactionsPage', () => {
  beforeEach(() => {
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
      refresh: vi.fn(),
      createTransaction: vi.fn(),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
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
});
