// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCategories, useDashboardData, useTransactions } from '../hooks';
import { DashboardPage } from './DashboardPage';

vi.mock('../hooks', () => ({
  useDashboardData: vi.fn(),
  useCategories: vi.fn(),
  // DashboardPage now calls useTransactions to feed chart components.
  useTransactions: vi.fn(),
}));

// Chart components depend on Recharts canvas APIs unavailable in jsdom.
// Stub them so the render test stays provider/canvas-free.
vi.mock('../components/charts', () => ({
  TrendLineChart: () => null,
  SpendingBarChart: () => null,
  CategoryPieChart: () => null,
}));

const mockedUseDashboardData = vi.mocked(useDashboardData);
const mockedUseCategories = vi.mocked(useCategories);
const mockedUseTransactions = vi.mocked(useTransactions);
const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

describe('DashboardPage', () => {
  beforeEach(() => {
    mockedUseDashboardData.mockReturnValue({
      data: {
        netWorth: 2475000,
        spentThisMonth: 234050,
        incomeThisMonth: 450000,
        monthlyBudget: 350000,
        budgetSpent: 234050,
        recentTransactions: [
          {
            id: '1',
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
            id: '2',
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
        ],
        accountSummary: [{ type: 'CHECKING', total: 2475000 }],
      },
      loading: false,
      error: null,
      refresh: vi.fn(),
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
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
      createCategory: vi.fn(),
      updateCategory: vi.fn(),
      deleteCategory: vi.fn(),
    });
    // useTransactions is called by DashboardPage to supply chart data.
    // Return an empty list — charts are stubbed, so no data is needed.
    mockedUseTransactions.mockReturnValue({
      transactions: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
      createTransaction: vi.fn(),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
    });
  });

  it('renders without crashing', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('displays financial summary cards', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Net Worth')).toBeInTheDocument();
    expect(screen.getByText('Spent This Month')).toBeInTheDocument();
    expect(screen.getByText('Budget Health')).toBeInTheDocument();
  });

  it('displays recent transactions section', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Recent Transactions')).toBeInTheDocument();
    expect(screen.getByText('Grocery Store')).toBeInTheDocument();
    expect(screen.getByText('Monthly Salary')).toBeInTheDocument();
  });

  it('has accessible landmarks', () => {
    render(<DashboardPage />);
    expect(screen.getByRole('region', { name: /financial summary/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /recent transactions/i })).toBeInTheDocument();
  });
});
