// SPDX-License-Identifier: MIT

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { useBudgets, useCategories } from '../hooks';
import { BudgetDetailPage } from './BudgetDetailPage';

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

const refreshMock = vi.fn();

function renderWithRoute(budgetId: string = 'budget-1') {
  return render(
    <MemoryRouter initialEntries={[`/budgets/${budgetId}`]}>
      <Routes>
        <Route path="/budgets/:id" element={<BudgetDetailPage />} />
        <Route path="/budgets" element={<div>Budgets list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BudgetDetailPage', () => {
  beforeEach(() => {
    refreshMock.mockReset();

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
      ],
      loading: false,
      error: null,
      refresh: refreshMock,
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
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
      createCategory: vi.fn(),
      updateCategory: vi.fn(),
      deleteCategory: vi.fn(),
    });
  });

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  it('shows loading spinner while budgets are loading', () => {
    mockedUseBudgets.mockReturnValue({
      budgets: [],
      loading: true,
      error: null,
      refresh: refreshMock,
      createBudget: vi.fn(),
      updateBudget: vi.fn(),
      deleteBudget: vi.fn(),
    });

    renderWithRoute();

    expect(screen.getByRole('status', { name: /loading budget/i })).toBeInTheDocument();
  });

  it('shows loading spinner while categories are loading', () => {
    mockedUseCategories.mockReturnValue({
      categories: [],
      loading: true,
      error: null,
      refresh: vi.fn(),
      createCategory: vi.fn(),
      updateCategory: vi.fn(),
      deleteCategory: vi.fn(),
    });

    renderWithRoute();

    expect(screen.getByRole('status', { name: /loading budget/i })).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  it('shows error banner when loading fails', () => {
    mockedUseBudgets.mockReturnValue({
      budgets: [],
      loading: false,
      error: 'Failed to load budgets.',
      refresh: refreshMock,
      createBudget: vi.fn(),
      updateBudget: vi.fn(),
      deleteBudget: vi.fn(),
    });

    renderWithRoute();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Failed to load budgets.')).toBeInTheDocument();
  });

  it('shows retry button on error', () => {
    mockedUseBudgets.mockReturnValue({
      budgets: [],
      loading: false,
      error: 'Database error',
      refresh: refreshMock,
      createBudget: vi.fn(),
      updateBudget: vi.fn(),
      deleteBudget: vi.fn(),
    });

    renderWithRoute();

    const retryButton = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryButton);
    expect(refreshMock).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Not found state
  // ---------------------------------------------------------------------------

  it('shows not found message when budget ID does not match', () => {
    renderWithRoute('nonexistent-id');

    expect(screen.getByText('Budget not found.')).toBeInTheDocument();
  });

  it('shows back link on not found state', () => {
    renderWithRoute('nonexistent-id');

    expect(screen.getByRole('link', { name: /back to budgets/i })).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Data present state
  // ---------------------------------------------------------------------------

  it('renders budget name as heading', () => {
    renderWithRoute();

    expect(screen.getByRole('heading', { name: /food/i, level: 2 })).toBeInTheDocument();
  });

  it('displays category name in details', () => {
    renderWithRoute();

    const article = screen.getByRole('article', { name: /budget details/i });
    expect(within(article).getByText('Food')).toBeInTheDocument();
  });

  it('displays budget period', () => {
    renderWithRoute();

    expect(screen.getByText('Monthly')).toBeInTheDocument();
  });

  it('displays start date', () => {
    renderWithRoute();

    expect(screen.getByText('2025-03-01')).toBeInTheDocument();
  });

  it('has an accessible article for budget details', () => {
    renderWithRoute();

    expect(screen.getByRole('article', { name: /budget details/i })).toBeInTheDocument();
  });

  it('displays spending progress section', () => {
    renderWithRoute();

    expect(screen.getByRole('region', { name: /spending progress/i })).toBeInTheDocument();
    expect(screen.getByText('Spending Progress')).toBeInTheDocument();
  });

  it('has accessible progress bar', () => {
    renderWithRoute();

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
    // 42350 / 60000 ≈ 71%
    expect(progressBar).toHaveAttribute('aria-valuenow', '71');
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax', '100');
  });

  it('displays spent and remaining labels', () => {
    renderWithRoute();

    expect(screen.getByText('Spent')).toBeInTheDocument();
    expect(screen.getByText('Remaining')).toBeInTheDocument();
  });

  it('shows rollover when enabled', () => {
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
          isRollover: true,
          spentAmount: { amount: 42350 },
          remainingAmount: { amount: 17650 },
          ...syncMetadata,
        },
      ],
      loading: false,
      error: null,
      refresh: refreshMock,
      createBudget: vi.fn(),
      updateBudget: vi.fn(),
      deleteBudget: vi.fn(),
    });

    renderWithRoute();

    expect(screen.getByText('Rollover')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it('shows over budget message when remaining is negative', () => {
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
          spentAmount: { amount: 65000 },
          remainingAmount: { amount: -5000 },
          ...syncMetadata,
        },
      ],
      loading: false,
      error: null,
      refresh: refreshMock,
      createBudget: vi.fn(),
      updateBudget: vi.fn(),
      deleteBudget: vi.fn(),
    });

    renderWithRoute();

    expect(screen.getByText(/over budget/i)).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  it('has back to budgets link', () => {
    renderWithRoute();

    const backLink = screen.getByRole('link', { name: /back to budgets/i });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute('href', '/budgets');
  });
});
