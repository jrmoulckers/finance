// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useAccounts, useGoals, useTransactions } from '../hooks';
import { GoalsPage } from './GoalsPage';

vi.mock('../hooks', () => ({
  useAccounts: vi.fn(),
  useGoals: vi.fn(),
  useTransactions: vi.fn(),
}));

// GoalForm renders unconditionally and calls useDatabase internally.
// Stub it out so the test has no provider dependency.
vi.mock('../components/forms', () => ({
  GoalForm: () => null,
}));

const mockedUseAccounts = vi.mocked(useAccounts);
const mockedUseGoals = vi.mocked(useGoals);
const mockedUseTransactions = vi.mocked(useTransactions);
const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
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
    });
  });

  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <GoalsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Goals' })).toBeInTheDocument();
  });

  it('displays goals summary', () => {
    render(
      <MemoryRouter>
        <GoalsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Target')).toBeInTheDocument();
  });

  it('displays individual goal names', () => {
    render(
      <MemoryRouter>
        <GoalsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
    expect(screen.getByText('Vacation')).toBeInTheDocument();
    expect(screen.getByText('New Laptop')).toBeInTheDocument();
    expect(screen.getByText('Down Payment')).toBeInTheDocument();
  });

  it('has accessible progress bars', () => {
    render(
      <MemoryRouter>
        <GoalsPage />
      </MemoryRouter>,
    );
    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars.length).toBe(4);
  });

  it('displays a contribute action for each goal', () => {
    render(
      <MemoryRouter>
        <GoalsPage />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('button', { name: /contribute to/i })).toHaveLength(4);
  });
});
