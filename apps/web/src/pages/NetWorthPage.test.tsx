// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for NetWorthPage component.
 *
 * Mocks the useNetWorth hook (not repositories) per project conventions.
 *
 * References: issue #1578
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NetWorthPage } from './NetWorthPage';

// Mock the hook
vi.mock('../hooks/useNetWorth', () => ({
  useNetWorth: vi.fn(),
}));

// Mock chart palette
vi.mock('../components/charts/chart-palette', () => ({
  CHART_COLORS: ['#648FFF', '#FE6100', '#785EF0', '#FFB000', '#DC267F', '#009E73'],
}));

import { useNetWorth } from '../hooks/useNetWorth';

const mockUseNetWorth = vi.mocked(useNetWorth);

describe('NetWorthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner while loading', () => {
    mockUseNetWorth.mockReturnValue({
      currentNetWorth: null,
      assetClasses: [],
      milestones: [],
      loading: true,
      error: null,
      refresh: vi.fn(),
    });

    render(<NetWorthPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows error banner on error', () => {
    mockUseNetWorth.mockReturnValue({
      currentNetWorth: null,
      assetClasses: [],
      milestones: [],
      loading: false,
      error: 'Failed to load',
      refresh: vi.fn(),
    });

    render(<NetWorthPage />);
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
  });

  it('shows empty state when no accounts', () => {
    mockUseNetWorth.mockReturnValue({
      currentNetWorth: null,
      assetClasses: [],
      milestones: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<NetWorthPage />);
    expect(screen.getByText('No accounts found')).toBeInTheDocument();
  });

  it('renders net worth data and milestones', () => {
    mockUseNetWorth.mockReturnValue({
      currentNetWorth: {
        label: '2024-03-15',
        assets: 2000000,
        liabilities: 500000,
        netWorth: 1500000,
      },
      assetClasses: [
        {
          className: 'Savings',
          accountTypes: ['SAVINGS'],
          balance: 1500000,
          percent: 75,
          accountCount: 1,
        },
        {
          className: 'Checking',
          accountTypes: ['CHECKING'],
          balance: 500000,
          percent: 25,
          accountCount: 1,
        },
      ],
      milestones: [
        {
          id: 'milestone-0',
          label: 'First $1K',
          thresholdCents: 100000,
          reached: true,
        },
        {
          id: 'milestone-1',
          label: 'First $50K',
          thresholdCents: 5000000,
          reached: false,
        },
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<NetWorthPage />);
    expect(screen.getByRole('heading', { name: 'Net Worth', level: 2 })).toBeInTheDocument();
    expect(screen.getByLabelText('Net worth summary')).toBeInTheDocument();
    expect(screen.getByText('Asset Class Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Milestones')).toBeInTheDocument();
    expect(screen.getByText('First $1K')).toBeInTheDocument();
    expect(screen.getByText('First $50K')).toBeInTheDocument();
  });
});
