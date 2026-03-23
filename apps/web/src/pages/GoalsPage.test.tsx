// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useGoals } from '../hooks';
import { GoalsPage } from './GoalsPage';

vi.mock('../hooks', () => ({
  useGoals: vi.fn(),
}));

// GoalForm renders unconditionally and calls useDatabase internally.
// Stub it out so the test has no provider dependency.
vi.mock('../components/forms', () => ({
  GoalForm: () => null,
}));

const mockedUseGoals = vi.mocked(useGoals);
const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

describe('GoalsPage', () => {
  beforeEach(() => {
    mockedUseGoals.mockReturnValue({
      goals: [
        {
          id: 'goal-1',
          householdId: 'household-1',
          name: 'Emergency Fund',
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
});
