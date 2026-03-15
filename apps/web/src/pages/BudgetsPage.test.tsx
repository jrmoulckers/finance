// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBudgets, useCategories } from '../hooks';
import { BudgetsPage } from './BudgetsPage';

vi.mock('../hooks', () => ({
  useBudgets: vi.fn(),
  useCategories: vi.fn(),
}));

const mockedUseBudgets = vi.mocked(useBudgets);
const mockedUseCategories = vi.mocked(useCategories);
const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

describe('BudgetsPage', () => {
  beforeEach(() => {
    mockedUseBudgets.mockReturnValue({
      budgets: [
        {
          id: 'budget-1',
          householdId: 'household-1',
          categoryId: 'category-food',
          name: 'Food',
          amount: { amount: 60000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          period: 'MONTHLY',
          startDate: '2025-03-01',
          endDate: null,
          isRollover: false,
          spentAmount: { amount: 42350 },
          remainingAmount: { amount: 17650 },
          ...syncMetadata,
        },
        {
          id: 'budget-2',
          householdId: 'household-1',
          categoryId: 'category-housing',
          name: 'Housing',
          amount: { amount: 120000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          period: 'MONTHLY',
          startDate: '2025-03-01',
          endDate: null,
          isRollover: false,
          spentAmount: { amount: 120000 },
          remainingAmount: { amount: 0 },
          ...syncMetadata,
        },
        {
          id: 'budget-3',
          householdId: 'household-1',
          categoryId: 'category-transport',
          name: 'Transport',
          amount: { amount: 30000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          period: 'MONTHLY',
          startDate: '2025-03-01',
          endDate: null,
          isRollover: false,
          spentAmount: { amount: 18730 },
          remainingAmount: { amount: 11270 },
          ...syncMetadata,
        },
        {
          id: 'budget-4',
          householdId: 'household-1',
          categoryId: 'category-entertainment',
          name: 'Entertainment',
          amount: { amount: 15000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          period: 'MONTHLY',
          startDate: '2025-03-01',
          endDate: null,
          isRollover: true,
          spentAmount: { amount: 14299 },
          remainingAmount: { amount: 701 },
          ...syncMetadata,
        },
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
      createBudget: vi.fn(),
      updateBudget: vi.fn(),
      deleteBudget: vi.fn(),
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
          id: 'category-housing',
          householdId: 'household-1',
          name: 'Housing',
          icon: 'home',
          color: '#7C3AED',
          parentId: null,
          isIncome: false,
          isSystem: false,
          sortOrder: 2,
          ...syncMetadata,
        },
        {
          id: 'category-transport',
          householdId: 'household-1',
          name: 'Transport',
          icon: 'car',
          color: '#2563EB',
          parentId: null,
          isIncome: false,
          isSystem: false,
          sortOrder: 3,
          ...syncMetadata,
        },
        {
          id: 'category-entertainment',
          householdId: 'household-1',
          name: 'Entertainment',
          icon: 'film',
          color: '#DB2777',
          parentId: null,
          isIncome: false,
          isSystem: false,
          sortOrder: 4,
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
  });

  it('renders without crashing', () => {
    render(<BudgetsPage />);
    expect(screen.getByText('Budgets')).toBeInTheDocument();
  });

  it('displays budget summary labels', () => {
    render(<BudgetsPage />);
    expect(screen.getByText('Budgeted')).toBeInTheDocument();
    expect(screen.getByText('Spent')).toBeInTheDocument();
    expect(screen.getByText('Remaining')).toBeInTheDocument();
  });

  it('displays budget category names', () => {
    render(<BudgetsPage />);
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('Housing')).toBeInTheDocument();
    expect(screen.getByText('Transport')).toBeInTheDocument();
    expect(screen.getByText('Entertainment')).toBeInTheDocument();
  });

  it('has accessible progress indicators', () => {
    render(<BudgetsPage />);
    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars.length).toBe(4);
  });
});
