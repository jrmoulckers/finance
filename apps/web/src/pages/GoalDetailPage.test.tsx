// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { useGoals } from '../hooks';
import { GoalDetailPage } from './GoalDetailPage';

vi.mock('../hooks', () => ({
  useGoals: vi.fn(),
}));

const mockedUseGoals = vi.mocked(useGoals);

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

const refreshMock = vi.fn();

function renderWithRoute(goalId: string = 'goal-1') {
  return render(
    <MemoryRouter initialEntries={[`/goals/${goalId}`]}>
      <Routes>
        <Route path="/goals/:id" element={<GoalDetailPage />} />
        <Route path="/goals" element={<div>Goals list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('GoalDetailPage', () => {
  beforeEach(() => {
    refreshMock.mockReset();

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
      ],
      loading: false,
      error: null,
      refresh: refreshMock,
      createGoal: vi.fn(),
      updateGoal: vi.fn(),
      deleteGoal: vi.fn(),
    });
  });

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  it('shows loading spinner while goals are loading', () => {
    mockedUseGoals.mockReturnValue({
      goals: [],
      loading: true,
      error: null,
      refresh: refreshMock,
      createGoal: vi.fn(),
      updateGoal: vi.fn(),
      deleteGoal: vi.fn(),
    });

    renderWithRoute();

    expect(screen.getByRole('status', { name: /loading goal/i })).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  it('shows error banner when loading fails', () => {
    mockedUseGoals.mockReturnValue({
      goals: [],
      loading: false,
      error: 'Failed to load goals.',
      refresh: refreshMock,
      createGoal: vi.fn(),
      updateGoal: vi.fn(),
      deleteGoal: vi.fn(),
    });

    renderWithRoute();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Failed to load goals.')).toBeInTheDocument();
  });

  it('shows retry button on error and calls refresh on click', () => {
    mockedUseGoals.mockReturnValue({
      goals: [],
      loading: false,
      error: 'Network error',
      refresh: refreshMock,
      createGoal: vi.fn(),
      updateGoal: vi.fn(),
      deleteGoal: vi.fn(),
    });

    renderWithRoute();

    const retryButton = screen.getByRole('button', { name: /retry/i });
    retryButton.click();
    expect(refreshMock).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Not found state
  // ---------------------------------------------------------------------------

  it('shows not found message when goal ID does not match', () => {
    renderWithRoute('nonexistent-id');

    expect(screen.getByText('Goal not found.')).toBeInTheDocument();
  });

  it('shows back link on not found state', () => {
    renderWithRoute('nonexistent-id');

    expect(screen.getByRole('link', { name: /back to goals/i })).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Data present state
  // ---------------------------------------------------------------------------

  it('renders goal name as heading', () => {
    renderWithRoute();

    expect(screen.getByRole('heading', { name: /emergency fund/i, level: 2 })).toBeInTheDocument();
  });

  it('displays goal status', () => {
    renderWithRoute();

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('displays formatted target date', () => {
    renderWithRoute();

    // 2025-12-31 → "December 31, 2025"
    expect(screen.getByText(/december 31, 2025/i)).toBeInTheDocument();
  });

  it('has an accessible article for goal details', () => {
    renderWithRoute();

    expect(screen.getByRole('article', { name: /goal details/i })).toBeInTheDocument();
  });

  it('displays goal progress section', () => {
    renderWithRoute();

    expect(screen.getByRole('region', { name: /goal progress/i })).toBeInTheDocument();
    expect(screen.getByText('Progress')).toBeInTheDocument();
  });

  it('has accessible progress bar', () => {
    renderWithRoute();

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
    // 1500000 / 2000000 = 75%
    expect(progressBar).toHaveAttribute('aria-valuenow', '75');
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax', '100');
  });

  it('shows remaining amount and percentage', () => {
    renderWithRoute();

    expect(screen.getByText(/75%/)).toBeInTheDocument();
  });

  it('shows time remaining when target date is set', () => {
    renderWithRoute();

    // Target date is 2025-12-31 — the "Time Remaining" label always renders
    // when targetDate is non-null, regardless of what Date.now() returns.
    expect(screen.getByText('Time Remaining')).toBeInTheDocument();
  });

  it('shows goal reached message when 100% complete', () => {
    mockedUseGoals.mockReturnValue({
      goals: [
        {
          id: 'goal-1',
          householdId: 'household-1',
          name: 'Emergency Fund',
          targetAmount: { amount: 2000000 },
          currentAmount: { amount: 2000000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          targetDate: '2025-12-31',
          status: 'ACTIVE',
          icon: 'shield',
          color: '#059669',
          accountId: 'account-2',
          ...syncMetadata,
        },
      ],
      loading: false,
      error: null,
      refresh: refreshMock,
      createGoal: vi.fn(),
      updateGoal: vi.fn(),
      deleteGoal: vi.fn(),
    });

    renderWithRoute();

    expect(screen.getByText(/goal reached/i)).toBeInTheDocument();
  });

  it('shows No target date when targetDate is null', () => {
    mockedUseGoals.mockReturnValue({
      goals: [
        {
          id: 'goal-1',
          householdId: 'household-1',
          name: 'Emergency Fund',
          targetAmount: { amount: 2000000 },
          currentAmount: { amount: 1500000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          targetDate: null,
          status: 'ACTIVE',
          icon: 'shield',
          color: '#059669',
          accountId: null,
          ...syncMetadata,
        },
      ],
      loading: false,
      error: null,
      refresh: refreshMock,
      createGoal: vi.fn(),
      updateGoal: vi.fn(),
      deleteGoal: vi.fn(),
    });

    renderWithRoute();

    expect(screen.getByText('No target date')).toBeInTheDocument();
    expect(screen.getByText('No due date')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  it('has back to goals link', () => {
    renderWithRoute();

    const backLink = screen.getByRole('link', { name: /back to goals/i });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute('href', '/goals');
  });
});
