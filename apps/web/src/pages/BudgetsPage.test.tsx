// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useBudgets } from '../hooks/useBudgets';
import { useCategories } from '../hooks/useCategories';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { useTransactions } from '../hooks/useTransactions';
import { useDisplayCurrency } from '../hooks/useDisplayCurrency';
import { AccessibilityProvider } from '../contexts/AccessibilityContext';
import { useExchangeRates } from '../hooks/useExchangeRates';

vi.mock('../components/forms', () => ({
  BudgetForm: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? (
      <div role="dialog" aria-label="Budget form">
        <label>
          <input type="checkbox" />
          Start from template
        </label>
        <p>Templates give you a realistic starting point.</p>
      </div>
    ) : null,
}));

vi.mock('../components/common/SyncIndicator', () => ({
  SyncIndicator: () => <span>Synced</span>,
}));

vi.mock('../components/budgets', () => ({
  BudgetAnalytics: () => (
    <div aria-label="Budget analytics">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          role="progressbar"
          aria-valuenow={0}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      ))}
    </div>
  ),
}));

import { BudgetsPage } from './BudgetsPage';

vi.mock('../hooks/useBudgets', () => ({
  useBudgets: vi.fn(),
}));

vi.mock('../hooks/useCategories', () => ({
  useCategories: vi.fn(),
  FOOD_MEAL_SUBCATEGORY_DEFINITIONS: [
    { name: 'Dining Out', icon: '🍽️', color: '#F97316', description: 'Restaurants' },
    { name: 'Delivery & Takeout', icon: '🥡', color: '#FB7185', description: 'Delivery' },
    { name: 'Coffee & Snacks', icon: '☕', color: '#A16207', description: 'Coffee' },
    { name: 'Meal Prep', icon: '🥗', color: '#0F766E', description: 'Meal prep' },
  ],
  isFoodMealBudgetParentCategory: (category: { id?: string; name?: string } | null) =>
    category?.id === 'category-food' || category?.name === 'Food',
}));

vi.mock('../hooks/useSyncStatus', () => ({
  useSyncStatus: vi.fn(),
}));

vi.mock('../hooks/useTransactions', () => ({
  useTransactions: vi.fn(),
}));

vi.mock('../hooks/useDisplayCurrency', () => ({
  useDisplayCurrency: vi.fn(),
}));

vi.mock('../hooks/useExchangeRates', () => ({
  useExchangeRates: vi.fn(),
}));

const mockedUseBudgets = vi.mocked(useBudgets);
const mockedUseCategories = vi.mocked(useCategories);
const mockedUseSyncStatus = vi.mocked(useSyncStatus);
const mockedUseTransactions = vi.mocked(useTransactions);
const mockedUseDisplayCurrency = vi.mocked(useDisplayCurrency);
const mockedUseExchangeRates = vi.mocked(useExchangeRates);
const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

describe('BudgetsPage', () => {
  beforeEach(() => {
    try {
      globalThis.localStorage?.clear();
    } catch {
      // Ignore unavailable storage in the test environment.
    }
    mockedUseTransactions.mockReturnValue({
      transactions: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
      createTransaction: vi.fn(),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
    });
    mockedUseDisplayCurrency.mockReturnValue({
      displayCurrency: 'USD',
      setDisplayCurrency: vi.fn(),
      supportedCurrencies: [
        { value: 'USD', label: 'US Dollar (USD)' },
        { value: 'THB', label: 'Thai Baht (THB)' },
        { value: 'EUR', label: 'Euro (EUR)' },
      ],
    });
    mockedUseExchangeRates.mockReturnValue({
      rates: {},
      loading: false,
      error: null,
      lastUpdated: null,
      providerName: 'Static Rates',
      isOffline: false,
      isStale: false,
      hasManualOverrides: false,
      convert: vi.fn(),
      getRate: vi.fn(),
      setOverride: vi.fn(),
      removeOverride: vi.fn(),
      overrides: {},
      clearOverrides: vi.fn(),
      refresh: vi.fn(),
    });
    mockedUseSyncStatus.mockReturnValue({
      isOnline: true,
      isOffline: false,
      pendingMutations: 0,
      lastSyncTime: null,
      isSyncing: false,
      syncNow: vi.fn(),
      authError: false,
      conflictCount: 0,
    });

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
      createBudgetTemplate: vi.fn(),
      updateBudget: vi.fn(),
      deleteBudget: vi.fn(),
      getBudgetSpendingBreakdown: vi.fn(),
      reorderBudgets: vi.fn(),
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
      foodMealTemplate: {
        parentCategory: {
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
        subcategories: [
          {
            id: 'category-groceries',
            householdId: 'household-1',
            name: 'Groceries',
            icon: '🛒',
            color: '#16A34A',
            parentId: 'category-food',
            isIncome: false,
            isSystem: false,
            sortOrder: 5,
            ...syncMetadata,
          },
        ],
        missingSubcategoryDefinitions: [
          { name: 'Dining Out', icon: '🍽️', color: '#F97316', description: 'Restaurants' },
          { name: 'Delivery & Takeout', icon: '🥡', color: '#FB7185', description: 'Delivery' },
          { name: 'Coffee & Snacks', icon: '☕', color: '#A16207', description: 'Coffee' },
          { name: 'Meal Prep', icon: '🥗', color: '#0F766E', description: 'Meal prep' },
        ],
      },
      ensureFoodMealCategories: vi.fn().mockReturnValue({
        parentCategory: {
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
        subcategories: [],
        missingSubcategoryDefinitions: [],
      }),
    });
  });

  it('exposes a labelled read-aloud control for total remaining when "Read amounts aloud" is enabled (#3278)', () => {
    render(
      <AccessibilityProvider initialSettings={{ speakAmounts: true }}>
        <MemoryRouter>
          <BudgetsPage />
        </MemoryRouter>
      </AccessibilityProvider>,
    );

    expect(
      screen.getByRole('button', { name: 'Read aloud: total remaining across budgets' }),
    ).toBeInTheDocument();
  });

  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <BudgetsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Budgets')).toBeInTheDocument();
  });

  it('shows a create-budget call-to-action in the empty state (#3402)', () => {
    mockedUseBudgets.mockReturnValue({
      budgets: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
      createBudget: vi.fn(),
      createBudgetTemplate: vi.fn(),
      updateBudget: vi.fn(),
      deleteBudget: vi.fn(),
      getBudgetSpendingBreakdown: vi.fn(),
      reorderBudgets: vi.fn(),
    });

    render(
      <MemoryRouter>
        <BudgetsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('No budget envelopes yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create your first budget/i })).toBeInTheDocument();
  });

  it('displays budget summary labels', () => {
    render(
      <MemoryRouter>
        <BudgetsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Budgeted')).toBeInTheDocument();
    expect(screen.getByText('Spent')).toBeInTheDocument();
    expect(screen.getByText('Remaining')).toBeInTheDocument();
  });

  it('displays budget category names', () => {
    render(
      <MemoryRouter>
        <BudgetsPage />
      </MemoryRouter>,
    );
    // Category names appear in both the analytics trends and budget cards
    expect(screen.getAllByText('Food').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Housing').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Transport').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Entertainment').length).toBeGreaterThanOrEqual(1);
  });

  it('shows a starter template option in the budget creation flow', () => {
    render(
      <MemoryRouter>
        <BudgetsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /add budget/i }));

    expect(screen.getByLabelText('Start from template')).toBeInTheDocument();
    expect(screen.getByText(/templates give you a realistic starting point/i)).toBeInTheDocument();
  });

  it('has accessible progress indicators', () => {
    render(
      <MemoryRouter>
        <BudgetsPage />
      </MemoryRouter>,
    );
    const progressBars = screen.getAllByRole('progressbar');
    // 4 budget ring charts + 1 trajectory bar + 4 category trend bars = 9
    expect(progressBars.length).toBe(9);
  });

  it('shows the Food & Meals quick-start template card', () => {
    render(
      <MemoryRouter>
        <BudgetsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Food & Meals template')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /use food & meals template/i })).toBeInTheDocument();
  });

  it('surfaces the trip & country budgets section on the budgets page', () => {
    render(
      <MemoryRouter>
        <BudgetsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /trip & country budgets/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Trip name')).toBeInTheDocument();
    expect(screen.getByText(/no trip budgets match the current filter/i)).toBeInTheDocument();
  });

  it('creates a trip budget from the budgets surface and shows its roll-up', () => {
    render(
      <MemoryRouter>
        <BudgetsPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Trip name'), {
      target: { value: 'Bangkok Jan' },
    });
    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2026-01-01' },
    });
    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2026-03-31' },
    });
    fireEvent.change(screen.getByLabelText('Local currency'), {
      target: { value: 'THB' },
    });
    fireEvent.change(screen.getByLabelText('Budget (local currency)'), {
      target: { value: '90000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add trip budget/i }));

    expect(screen.getByRole('heading', { name: 'Bangkok Jan' })).toBeInTheDocument();
    expect(screen.getByText(/showing 1 trip budget/i)).toBeInTheDocument();
  });
});
