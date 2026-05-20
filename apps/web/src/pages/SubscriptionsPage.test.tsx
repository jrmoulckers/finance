// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for SubscriptionsPage component.
 *
 * Mocks the useSubscriptions hook (not repositories) per project conventions.
 *
 * References: issue #1593
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubscriptionsPage } from './SubscriptionsPage';

// Mock the hook
vi.mock('../hooks/useSubscriptions', () => ({
  useSubscriptions: vi.fn(),
}));

// Mock chart palette
vi.mock('../components/charts/chart-palette', () => ({
  CHART_COLORS: ['#648FFF', '#FE6100', '#785EF0', '#FFB000', '#DC267F', '#009E73'],
}));

import { useSubscriptions } from '../hooks/useSubscriptions';

const mockUseSubscriptions = vi.mocked(useSubscriptions);

describe('SubscriptionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner while loading', () => {
    mockUseSubscriptions.mockReturnValue({
      subscriptions: [],
      summary: {
        totalMonthlyCents: 0,
        totalAnnualCents: 0,
        activeCount: 0,
        flaggedCount: 0,
        cancelledCount: 0,
        byCategory: [],
      },
      loading: true,
      error: null,
      refresh: vi.fn(),
      toggleStatus: vi.fn(),
      setStatus: vi.fn(),
    });

    render(<SubscriptionsPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows error banner on error', () => {
    mockUseSubscriptions.mockReturnValue({
      subscriptions: [],
      summary: {
        totalMonthlyCents: 0,
        totalAnnualCents: 0,
        activeCount: 0,
        flaggedCount: 0,
        cancelledCount: 0,
        byCategory: [],
      },
      loading: false,
      error: 'Detection failed',
      refresh: vi.fn(),
      toggleStatus: vi.fn(),
      setStatus: vi.fn(),
    });

    render(<SubscriptionsPage />);
    expect(screen.getByText('Detection failed')).toBeInTheDocument();
  });

  it('shows empty state when no subscriptions', () => {
    mockUseSubscriptions.mockReturnValue({
      subscriptions: [],
      summary: {
        totalMonthlyCents: 0,
        totalAnnualCents: 0,
        activeCount: 0,
        flaggedCount: 0,
        cancelledCount: 0,
        byCategory: [],
      },
      loading: false,
      error: null,
      refresh: vi.fn(),
      toggleStatus: vi.fn(),
      setStatus: vi.fn(),
    });

    render(<SubscriptionsPage />);
    expect(screen.getByText('No subscriptions detected')).toBeInTheDocument();
  });

  it('renders subscriptions with metrics and cards', () => {
    mockUseSubscriptions.mockReturnValue({
      subscriptions: [
        {
          id: 'sub-netflix',
          name: 'Netflix',
          categoryId: 'cat-1',
          categoryName: 'Streaming',
          amountCents: 1599,
          cadence: 'monthly',
          monthlyCostCents: 1599,
          annualCostCents: 19188,
          transactionCount: 6,
          lastDate: '2024-06-15',
          status: 'active',
        },
        {
          id: 'sub-spotify',
          name: 'Spotify',
          categoryId: 'cat-1',
          categoryName: 'Streaming',
          amountCents: 999,
          cadence: 'monthly',
          monthlyCostCents: 999,
          annualCostCents: 11988,
          transactionCount: 6,
          lastDate: '2024-06-14',
          status: 'flagged',
        },
      ],
      summary: {
        totalMonthlyCents: 2598,
        totalAnnualCents: 31176,
        activeCount: 2,
        flaggedCount: 1,
        cancelledCount: 0,
        byCategory: [
          {
            categoryName: 'Streaming',
            monthlyCostCents: 2598,
            subscriptionCount: 2,
            percent: 100,
          },
        ],
      },
      loading: false,
      error: null,
      refresh: vi.fn(),
      toggleStatus: vi.fn(),
      setStatus: vi.fn(),
    });

    render(<SubscriptionsPage />);
    expect(screen.getByText('Subscriptions')).toBeInTheDocument();
    expect(screen.getByLabelText('Subscription summary')).toBeInTheDocument();
    expect(screen.getByText('Netflix')).toBeInTheDocument();
    expect(screen.getByText('Spotify')).toBeInTheDocument();
    expect(screen.getByText('All Subscriptions (2)')).toBeInTheDocument();
  });
});
