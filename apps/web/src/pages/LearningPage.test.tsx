// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAccounts, useDashboardData, useGoals, useTransactions } from '../hooks';
import LearningPage from './LearningPage';

vi.mock('../hooks', () => ({
  useDashboardData: vi.fn(),
  useAccounts: vi.fn(),
  useGoals: vi.fn(),
  useTransactions: vi.fn(),
}));

vi.mock('../components/icons', () => ({
  AppIcon: () => <span data-testid="app-icon" />,
}));

const mockedUseDashboardData = vi.mocked(useDashboardData);
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

describe('LearningPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();

    mockedUseDashboardData.mockReturnValue({
      data: {
        netWorth: 2500000,
        spentThisMonth: 180000,
        incomeThisMonth: 420000,
        monthlyBudget: 0,
        budgetSpent: 0,
        recentTransactions: [],
        accountSummary: [],
      },
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    mockedUseAccounts.mockReturnValue({
      accounts: [
        {
          id: 'checking-1',
          householdId: 'household-1',
          name: 'Checking',
          type: 'CHECKING',
          currentBalance: { amount: 250000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          isArchived: false,
          sortOrder: 0,
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

    mockedUseTransactions.mockReturnValue({
      transactions: [
        {
          id: 'transaction-1',
          householdId: 'household-1',
          accountId: 'checking-1',
          categoryId: null,
          type: 'EXPENSE',
          status: 'CLEARED',
          amount: { amount: 5400 },
          currency: { code: 'USD', decimalPlaces: 2 },
          payee: 'Grocer',
          note: null,
          date: '2025-01-15',
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
  });

  it('renders the learning path overview and default recommendation', () => {
    render(<LearningPage />);

    expect(
      screen.getByRole('heading', { name: /personalized financial literacy learning path/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Structured path')).toBeInTheDocument();
    expect(screen.getAllByText('Start With a Simple Spending Plan').length).toBeGreaterThan(0);
  });

  it('updates progress and stores it locally when a lesson is completed', () => {
    render(<LearningPage />);

    fireEvent.click(screen.getByRole('button', { name: /mark lesson complete/i }));

    expect(screen.getByText('1/20')).toBeInTheDocument();
    expect(window.localStorage.getItem('finance:learning-progress')).toContain(
      'budget-foundations',
    );
  });

  it('records quiz results after the knowledge check', () => {
    render(<LearningPage />);

    fireEvent.click(
      screen.getByRole('radio', {
        name: /variable expenses like dining out/i,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /submit answers/i }));

    expect(screen.getByText('100% on this attempt')).toBeInTheDocument();
  });
});
