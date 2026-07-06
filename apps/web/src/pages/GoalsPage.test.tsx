// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useAccounts, useCategories, useGoals, useTransactions } from '../hooks';
import { GoalsPage } from './GoalsPage';
import { AccessibilityProvider } from '../contexts/AccessibilityContext';

vi.mock('../hooks', () => ({
  useAccounts: vi.fn(),
  useGoals: vi.fn(),
  useCategories: vi.fn(),
  useTransactions: vi.fn(),
}));

// GoalForm renders unconditionally and calls useDatabase internally.
// Stub it out so the test has no provider dependency.
vi.mock('../components/forms', () => ({
  GoalForm: () => null,
}));

const mockedUseAccounts = vi.mocked(useAccounts);
const mockedUseGoals = vi.mocked(useGoals);
const mockedUseCategories = vi.mocked(useCategories);
const mockedUseTransactions = vi.mocked(useTransactions);
const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};
const transactionMetadata = {
  tags: [],
  moodTag: null,
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
};

describe('GoalsPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockedUseAccounts.mockReturnValue({
      accounts: [
        {
          id: 'account-1',
          householdId: 'household-1',
          name: 'Business Checking',
          type: 'CHECKING',
          purpose: 'business',
          currency: { code: 'USD', decimalPlaces: 2 },
          currentBalance: { amount: 1250000 },
          isArchived: false,
          sortOrder: 1,
          icon: null,
          color: null,
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
    mockedUseTransactions.mockReturnValue({
      transactions: [
        {
          id: 'income-1',
          householdId: 'household-1',
          accountId: 'account-1',
          categoryId: null,
          type: 'INCOME',
          status: 'CLEARED',
          amount: { amount: 500000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          payee: 'Client Retainer',
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
      refresh: vi.fn(),
      createTransaction: vi.fn(),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
    });
    mockedUseGoals.mockReturnValue({
      goals: [
        {
          id: 'goal-1',
          householdId: 'household-1',
          name: 'Emergency Fund',
          description: 'Keep three months of expenses saved.',
          targetAmount: { amount: 2000000 },
          currentAmount: { amount: 1500000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          targetDate: '2025-12-31',
          status: 'ACTIVE',
          icon: 'shield',
          color: '#059669',
          accountId: 'account-2',
          ...syncMetadata,
        },
        {
          id: 'goal-2',
          householdId: 'household-1',
          name: 'Vacation',
          description: null,
          targetAmount: { amount: 500000 },
          currentAmount: { amount: 240000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          targetDate: '2025-09-01',
          status: 'ACTIVE',
          icon: 'plane',
          color: '#2563EB',
          accountId: 'account-1',
          ...syncMetadata,
        },
        {
          id: 'goal-3',
          householdId: 'household-1',
          name: 'New Laptop',
          description: null,
          targetAmount: { amount: 200000 },
          currentAmount: { amount: 85000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          targetDate: '2025-06-15',
          status: 'ACTIVE',
          icon: 'laptop',
          color: '#F59E0B',
          accountId: null,
          ...syncMetadata,
        },
        {
          id: 'goal-4',
          householdId: 'household-1',
          name: 'Down Payment',
          description: null,
          targetAmount: { amount: 6000000 },
          currentAmount: { amount: 1200000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          targetDate: '2027-01-01',
          status: 'ACTIVE',
          icon: 'home',
          color: '#7C3AED',
          accountId: null,
          ...syncMetadata,
        },
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
      createGoal: vi.fn(),
      updateGoal: vi.fn(),
      contributeToGoal: vi.fn(),
      deleteGoal: vi.fn(),
      reorderGoals: vi.fn(),
    });
    mockedUseAccounts.mockReturnValue({
      accounts: [
        {
          id: 'account-1',
          householdId: 'household-1',
          name: 'Checking',
          type: 'CHECKING',
          currency: { code: 'USD', decimalPlaces: 2 },
          currentBalance: { amount: 150000 },
          isArchived: false,
          sortOrder: 1,
          icon: 'bank',
          color: '#2563EB',
          ...syncMetadata,
        },
        {
          id: 'account-2',
          householdId: 'household-1',
          name: 'Brokerage',
          type: 'INVESTMENT',
          currency: { code: 'USD', decimalPlaces: 2 },
          currentBalance: { amount: 250000 },
          isArchived: false,
          sortOrder: 2,
          icon: 'trending-up',
          color: '#059669',
          ...syncMetadata,
        },
        {
          id: 'account-3',
          householdId: 'household-1',
          name: 'Credit Card',
          type: 'CREDIT_CARD',
          currency: { code: 'USD', decimalPlaces: 2 },
          currentBalance: { amount: -120000 },
          isArchived: false,
          sortOrder: 3,
          icon: 'credit-card',
          color: '#DC2626',
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
          id: 'income',
          householdId: 'household-1',
          name: 'Income',
          icon: 'wallet',
          color: '#059669',
          parentId: null,
          isIncome: true,
          isSystem: true,
          sortOrder: 1,
          ...syncMetadata,
        },
        {
          id: 'housing',
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
          id: 'dining',
          householdId: 'household-1',
          name: 'Dining Out',
          icon: 'utensils',
          color: '#F59E0B',
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
      foodMealTemplate: {
        parentCategory: null,
        subcategories: [],
        missingSubcategoryDefinitions: [],
      },
      ensureFoodMealCategories: vi.fn(),
    });
    mockedUseTransactions.mockReturnValue({
      transactions: [
        {
          id: 'tx-income',
          householdId: 'household-1',
          accountId: 'account-1',
          categoryId: 'income',
          type: 'INCOME',
          status: 'CLEARED',
          amount: { amount: 600000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          payee: 'Payroll',
          note: null,
          date: '2025-06-01',
          transferAccountId: null,
          transferTransactionId: null,
          isRecurring: false,
          recurringRuleId: null,
          ...transactionMetadata,
          ...syncMetadata,
        },
        {
          id: 'tx-housing',
          householdId: 'household-1',
          accountId: 'account-1',
          categoryId: 'housing',
          type: 'EXPENSE',
          status: 'CLEARED',
          amount: { amount: 220000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          payee: 'Landlord',
          note: null,
          date: '2025-06-02',
          transferAccountId: null,
          transferTransactionId: null,
          isRecurring: false,
          recurringRuleId: null,
          ...transactionMetadata,
          ...syncMetadata,
        },
        {
          id: 'tx-dining',
          householdId: 'household-1',
          accountId: 'account-1',
          categoryId: 'dining',
          type: 'EXPENSE',
          status: 'CLEARED',
          amount: { amount: 95000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          payee: 'Restaurant',
          note: null,
          date: '2025-06-05',
          transferAccountId: null,
          transferTransactionId: null,
          isRecurring: false,
          recurringRuleId: null,
          ...transactionMetadata,
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
  });

  it('exposes a labelled read-aloud control for total saved when "Read amounts aloud" is enabled (#3278)', () => {
    render(
      <AccessibilityProvider initialSettings={{ speakAmounts: true }}>
        <MemoryRouter>
          <GoalsPage />
        </MemoryRouter>
      </AccessibilityProvider>,
    );

    expect(
      screen.getByRole('button', { name: 'Read aloud: total saved across goals' }),
    ).toBeInTheDocument();
  });

  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <GoalsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Goals' })).toBeTruthy();
  });

  it('shows a create-goal call-to-action in the empty state (#3402)', () => {
    mockedUseGoals.mockReturnValue({
      goals: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
      createGoal: vi.fn(),
      updateGoal: vi.fn(),
      contributeToGoal: vi.fn(),
      deleteGoal: vi.fn(),
      reorderGoals: vi.fn(),
    });

    render(
      <MemoryRouter>
        <GoalsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('No goals yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: /create your first goal/i })).toBeTruthy();
  });

  it('displays goals summary and ai suggestions', () => {
    render(
      <MemoryRouter>
        <GoalsPage />
      </MemoryRouter>,
    );
    expect(screen.getAllByText('Saved').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Target').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AI-suggested goals').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/local-first suggestions from your spending patterns/i).length,
    ).toBeGreaterThan(0);
  });

  it('displays individual goal names and suggested cards', () => {
    render(
      <MemoryRouter>
        <GoalsPage />
      </MemoryRouter>,
    );
    expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Vacation').length).toBeGreaterThan(0);
    expect(screen.getAllByText('New Laptop').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Down Payment').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/finish funding vacation/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /planner open/i }).length).toBeGreaterThan(0);
  });

  it('has accessible progress bars', () => {
    render(
      <MemoryRouter>
        <GoalsPage />
      </MemoryRouter>,
    );
    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars.length).toBeGreaterThanOrEqual(4);
  });

  it('displays a contribute action for each goal', () => {
    render(
      <MemoryRouter>
        <GoalsPage />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('Contribute').length).toBeGreaterThanOrEqual(4);
  });
});
