// SPDX-License-Identifier: BUSL-1.1

import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WatchlistsPage } from './WatchlistsPage';
import { useCategories } from '../hooks/useCategories';
import { useSpendingWatchlists } from '../hooks/useSpendingWatchlists';
import type { WatchlistAlert } from '../hooks/useSpendingWatchlists';

vi.mock('../hooks/useCategories', () => ({
  useCategories: vi.fn(),
}));

vi.mock('../hooks/useSpendingWatchlists', () => ({
  useSpendingWatchlists: vi.fn(),
}));

const mockedUseCategories = vi.mocked(useCategories);
const mockedUseSpendingWatchlists = vi.mocked(useSpendingWatchlists);

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

describe('WatchlistsPage', () => {
  beforeEach(() => {
    mockedUseCategories.mockReturnValue({
      categories: [
        {
          id: 'cat-food',
          householdId: 'h1',
          name: 'Food',
          icon: null,
          color: null,
          parentId: null,
          isIncome: false,
          isSystem: false,
          sortOrder: 1,
          ...syncMetadata,
        },
        {
          id: 'cat-transport',
          householdId: 'h1',
          name: 'Transport',
          icon: null,
          color: null,
          parentId: null,
          isIncome: false,
          isSystem: false,
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

    mockedUseSpendingWatchlists.mockReturnValue({
      watchlists: [],
      alerts: [],
      loading: false,
      error: null,
      addWatchlist: vi.fn(),
      removeWatchlist: vi.fn(),
      updateThreshold: vi.fn(),
      toggleAlerts: vi.fn(),
      dismissAlert: vi.fn(),
      reorderWatchlists: vi.fn(),
      refresh: vi.fn(),
    });
  });

  it('renders the page heading', () => {
    render(<WatchlistsPage />);
    expect(screen.getByText('Spending Watchlists')).toBeInTheDocument();
  });

  it('shows empty state when no watchlists exist', () => {
    render(<WatchlistsPage />);
    expect(screen.getByText('No watchlists yet')).toBeInTheDocument();
  });

  it('renders the add watchlist button', () => {
    render(<WatchlistsPage />);
    expect(screen.getByRole('button', { name: /add new spending watchlist/i })).toBeInTheDocument();
  });

  it('opens add form when button is clicked', () => {
    render(<WatchlistsPage />);
    fireEvent.click(screen.getByRole('button', { name: /add new spending watchlist/i }));
    expect(screen.getByRole('dialog', { name: /add spending watchlist/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
    expect(screen.getByLabelText('Spending Limit ($)')).toBeInTheDocument();
  });

  it('displays watchlist items when they exist', () => {
    mockedUseSpendingWatchlists.mockReturnValue({
      watchlists: [
        {
          id: 'wl-1',
          categoryId: 'cat-food',
          categoryName: 'Food',
          thresholdCents: 50000,
          period: 'monthly',
          alertsEnabled: true,
          createdAt: '2025-01-01T00:00:00Z',
        },
      ],
      alerts: [],
      loading: false,
      error: null,
      addWatchlist: vi.fn(),
      removeWatchlist: vi.fn(),
      updateThreshold: vi.fn(),
      toggleAlerts: vi.fn(),
      dismissAlert: vi.fn(),
      reorderWatchlists: vi.fn(),
      refresh: vi.fn(),
    });

    render(<WatchlistsPage />);
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('monthly')).toBeInTheDocument();
  });

  it('reorders watchlists with Alt+Arrow keyboard shortcuts', () => {
    const reorderWatchlists = vi.fn();

    mockedUseSpendingWatchlists.mockReturnValue({
      watchlists: [
        {
          id: 'wl-1',
          categoryId: 'cat-food',
          categoryName: 'Food',
          thresholdCents: 50000,
          period: 'monthly',
          alertsEnabled: true,
          createdAt: '2025-01-01T00:00:00Z',
        },
        {
          id: 'wl-2',
          categoryId: 'cat-transport',
          categoryName: 'Transport',
          thresholdCents: 30000,
          period: 'monthly',
          alertsEnabled: true,
          createdAt: '2025-01-01T00:00:00Z',
        },
      ],
      alerts: [],
      loading: false,
      error: null,
      addWatchlist: vi.fn(),
      removeWatchlist: vi.fn(),
      updateThreshold: vi.fn(),
      toggleAlerts: vi.fn(),
      dismissAlert: vi.fn(),
      reorderWatchlists,
      refresh: vi.fn(),
    });

    render(<WatchlistsPage />);
    fireEvent.keyDown(screen.getByRole('button', { name: /reorder food/i }), {
      key: 'ArrowDown',
      altKey: true,
    });

    expect(reorderWatchlists).toHaveBeenCalledWith(0, 1);
  });

  it('displays alert cards when alerts are active', () => {
    const alerts: WatchlistAlert[] = [
      {
        watchlist: {
          id: 'wl-1',
          categoryId: 'cat-food',
          categoryName: 'Food',
          thresholdCents: 50000,
          period: 'monthly',
          alertsEnabled: true,
          createdAt: '2025-01-01T00:00:00Z',
        },
        spentCents: 45000,
        percentage: 90,
        level: 'warning',
        message: 'Food: $450.00 of $500.00 (90%) — approaching limit',
      },
    ];

    mockedUseSpendingWatchlists.mockReturnValue({
      watchlists: [alerts[0].watchlist],
      alerts,
      loading: false,
      error: null,
      addWatchlist: vi.fn(),
      removeWatchlist: vi.fn(),
      updateThreshold: vi.fn(),
      toggleAlerts: vi.fn(),
      dismissAlert: vi.fn(),
      reorderWatchlists: vi.fn(),
      refresh: vi.fn(),
    });

    render(<WatchlistsPage />);
    expect(screen.getByText('Active Alerts')).toBeInTheDocument();
    expect(screen.getByText(/approaching limit/)).toBeInTheDocument();
  });

  it('calls dismissAlert when dismiss button is clicked', () => {
    const dismissAlert = vi.fn();
    const alerts: WatchlistAlert[] = [
      {
        watchlist: {
          id: 'wl-1',
          categoryId: 'cat-food',
          categoryName: 'Food',
          thresholdCents: 50000,
          period: 'monthly',
          alertsEnabled: true,
          createdAt: '2025-01-01T00:00:00Z',
        },
        spentCents: 55000,
        percentage: 110,
        level: 'critical',
        message: 'Food: $550.00 spent — exceeded $500.00 limit!',
      },
    ];

    mockedUseSpendingWatchlists.mockReturnValue({
      watchlists: [alerts[0].watchlist],
      alerts,
      loading: false,
      error: null,
      addWatchlist: vi.fn(),
      removeWatchlist: vi.fn(),
      updateThreshold: vi.fn(),
      toggleAlerts: vi.fn(),
      dismissAlert,
      reorderWatchlists: vi.fn(),
      refresh: vi.fn(),
    });

    render(<WatchlistsPage />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss food alert/i }));
    expect(dismissAlert).toHaveBeenCalledWith('wl-1');
  });

  it('has accessible landmarks', () => {
    const alerts: WatchlistAlert[] = [
      {
        watchlist: {
          id: 'wl-1',
          categoryId: 'cat-food',
          categoryName: 'Food',
          thresholdCents: 50000,
          period: 'monthly',
          alertsEnabled: true,
          createdAt: '2025-01-01T00:00:00Z',
        },
        spentCents: 45000,
        percentage: 90,
        level: 'warning',
        message: 'Food: $450.00 of $500.00 (90%) — approaching limit',
      },
    ];

    mockedUseSpendingWatchlists.mockReturnValue({
      watchlists: [alerts[0].watchlist],
      alerts,
      loading: false,
      error: null,
      addWatchlist: vi.fn(),
      removeWatchlist: vi.fn(),
      updateThreshold: vi.fn(),
      toggleAlerts: vi.fn(),
      dismissAlert: vi.fn(),
      reorderWatchlists: vi.fn(),
      refresh: vi.fn(),
    });

    render(<WatchlistsPage />);
    expect(screen.getByRole('region', { name: /spending alerts/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /configured watchlists/i })).toBeInTheDocument();
  });

  it('shows loading spinner while loading', () => {
    mockedUseSpendingWatchlists.mockReturnValue({
      watchlists: [],
      alerts: [],
      loading: true,
      error: null,
      addWatchlist: vi.fn(),
      removeWatchlist: vi.fn(),
      updateThreshold: vi.fn(),
      toggleAlerts: vi.fn(),
      dismissAlert: vi.fn(),
      reorderWatchlists: vi.fn(),
      refresh: vi.fn(),
    });

    render(<WatchlistsPage />);
    expect(screen.getByText('Loading watchlists')).toBeInTheDocument();
  });

  it('shows error banner on error', () => {
    mockedUseSpendingWatchlists.mockReturnValue({
      watchlists: [],
      alerts: [],
      loading: false,
      error: 'Something went wrong',
      addWatchlist: vi.fn(),
      removeWatchlist: vi.fn(),
      updateThreshold: vi.fn(),
      toggleAlerts: vi.fn(),
      dismissAlert: vi.fn(),
      reorderWatchlists: vi.fn(),
      refresh: vi.fn(),
    });

    render(<WatchlistsPage />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('alert cards have role="alert" for screen readers', () => {
    const alerts: WatchlistAlert[] = [
      {
        watchlist: {
          id: 'wl-1',
          categoryId: 'cat-food',
          categoryName: 'Food',
          thresholdCents: 50000,
          period: 'monthly',
          alertsEnabled: true,
          createdAt: '2025-01-01T00:00:00Z',
        },
        spentCents: 55000,
        percentage: 110,
        level: 'critical',
        message: 'Food: $550.00 spent — exceeded $500.00 limit!',
      },
    ];

    mockedUseSpendingWatchlists.mockReturnValue({
      watchlists: [alerts[0].watchlist],
      alerts,
      loading: false,
      error: null,
      addWatchlist: vi.fn(),
      removeWatchlist: vi.fn(),
      updateThreshold: vi.fn(),
      toggleAlerts: vi.fn(),
      dismissAlert: vi.fn(),
      reorderWatchlists: vi.fn(),
      refresh: vi.fn(),
    });

    render(<WatchlistsPage />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
