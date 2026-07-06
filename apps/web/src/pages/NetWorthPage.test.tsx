// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for NetWorthPage component.
 *
 * Mocks the useNetWorth hook (not repositories) per project conventions.
 *
 * References: issue #1578
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NetWorthPage } from './NetWorthPage';

// Mock the hook
vi.mock('../hooks/useNetWorth', () => ({
  useNetWorth: vi.fn(),
}));

// Mock chart palette
vi.mock('../components/charts/chart-palette', () => ({
  CHART_COLORS: ['#648FFF', '#FE6100', '#785EF0', '#FFB000', '#DC267F', '#009E73'],
}));

// Stub the projection chart — recharts SVG APIs are unavailable in jsdom and the
// chart is covered by its own test. Mock hooks/heavy components, not repositories.
vi.mock('../components/charts/NetWorthProjectionChart', () => ({
  NetWorthProjectionChart: () => <div data-testid="net-worth-projection-chart" />,
}));

import { useNetWorth } from '../hooks/useNetWorth';
import type { UseNetWorthResult } from '../hooks/useNetWorth';

const mockUseNetWorth = vi.mocked(useNetWorth);

/**
 * Build a complete {@link UseNetWorthResult} for the mocked hook. Tests pass
 * only the fields they exercise; everything else defaults to an empty/neutral
 * value so adding a new field to the hook never breaks unrelated cases.
 */
function makeNetWorthResult(overrides: Partial<UseNetWorthResult> = {}): UseNetWorthResult {
  return {
    currentNetWorth: null,
    assetClasses: [],
    milestones: [],
    history: [],
    periodComparison: null,
    loading: false,
    error: null,
    refresh: vi.fn(),
    displayCurrency: 'USD',
    isConverted: false,
    hasStaleRates: false,
    unconvertedCurrencies: [],
    conversionDisclosure: null,
    ...overrides,
  };
}

describe('NetWorthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner while loading', () => {
    mockUseNetWorth.mockReturnValue(makeNetWorthResult({ loading: true }));

    render(<NetWorthPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows error banner on error', () => {
    mockUseNetWorth.mockReturnValue(makeNetWorthResult({ error: 'Failed to load' }));

    render(<NetWorthPage />);
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
  });

  it('shows empty state when no accounts', () => {
    mockUseNetWorth.mockReturnValue(makeNetWorthResult());

    render(<NetWorthPage />);
    expect(screen.getByText('No accounts found')).toBeInTheDocument();
  });

  it('renders net worth data and milestones', () => {
    mockUseNetWorth.mockReturnValue(
      makeNetWorthResult({
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
            isLiability: false,
            percent: 75,
            accountCount: 1,
          },
          {
            className: 'Checking',
            accountTypes: ['CHECKING'],
            balance: 500000,
            isLiability: false,
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
      }),
    );

    render(<NetWorthPage />);
    expect(screen.getByRole('heading', { name: 'Net Worth', level: 1 })).toBeInTheDocument();
    expect(screen.getByLabelText('Net worth summary')).toBeInTheDocument();
    expect(screen.getByText('Asset Class Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Milestones')).toBeInTheDocument();
    expect(screen.getByText('First $1K')).toBeInTheDocument();
    expect(screen.getByText('First $50K')).toBeInTheDocument();
  });

  it('renders the net worth projection section when history is available', () => {
    mockUseNetWorth.mockReturnValue(
      makeNetWorthResult({
        currentNetWorth: {
          label: '2024-03-15',
          assets: 2000000,
          liabilities: 500000,
          netWorth: 1500000,
        },
        history: [
          { label: 'Jan', netWorthCents: 1000000, dateIso: '2024-01-31' },
          { label: 'Feb', netWorthCents: 1250000, dateIso: '2024-02-29' },
          { label: 'Mar', netWorthCents: 1500000, dateIso: '2024-03-15' },
        ],
      }),
    );

    render(<NetWorthPage />);
    expect(
      screen.getByRole('region', { name: 'Net worth growth and projection' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('net-worth-projection-chart')).toBeInTheDocument();
  });

  it('renders the period-over-period change when a comparison is available', () => {
    mockUseNetWorth.mockReturnValue(
      makeNetWorthResult({
        currentNetWorth: {
          label: 'Mar',
          assets: 2000000,
          liabilities: 500000,
          netWorth: 1500000,
        },
        history: [
          { label: 'Feb', netWorthCents: 1250000, dateIso: '2024-02-29' },
          { label: 'Mar', netWorthCents: 1500000, dateIso: '2024-03-15' },
        ],
        periodComparison: {
          currentLabel: 'Mar',
          previousLabel: 'Feb',
          currentNetWorth: 1500000,
          previousNetWorth: 1250000,
          changeCents: 250000,
          changePercent: 20,
        },
      }),
    );

    render(<NetWorthPage />);
    expect(screen.getByText(/vs Feb/)).toBeInTheDocument();
    expect(screen.getByText(/\(\+20%\)/)).toBeInTheDocument();
  });

  it('omits the period-over-period change when no comparison exists', () => {
    mockUseNetWorth.mockReturnValue(
      makeNetWorthResult({
        currentNetWorth: {
          label: 'Mar',
          assets: 2000000,
          liabilities: 500000,
          netWorth: 1500000,
        },
        periodComparison: null,
      }),
    );

    render(<NetWorthPage />);
    expect(screen.queryByText(/ vs /)).not.toBeInTheDocument();
  });

  it('renders the workspace purpose filter and defaults to all accounts', () => {
    mockUseNetWorth.mockReturnValue(
      makeNetWorthResult({
        currentNetWorth: {
          label: '2024-03-15',
          assets: 2000000,
          liabilities: 500000,
          netWorth: 1500000,
        },
      }),
    );

    render(<NetWorthPage />);
    expect(screen.getByRole('group', { name: 'Filter by account purpose' })).toBeInTheDocument();
    expect(mockUseNetWorth).toHaveBeenCalledWith('all');
  });

  it('scopes net worth to the business workspace when selected', () => {
    mockUseNetWorth.mockReturnValue(
      makeNetWorthResult({
        currentNetWorth: {
          label: '2024-03-15',
          assets: 2000000,
          liabilities: 500000,
          netWorth: 1500000,
        },
      }),
    );

    render(<NetWorthPage />);
    fireEvent.click(screen.getByRole('button', { name: /Business/ }));
    expect(mockUseNetWorth).toHaveBeenLastCalledWith('business');
  });

  it('keeps the workspace filter visible when the selected workspace has no balances', () => {
    mockUseNetWorth.mockReturnValue(
      makeNetWorthResult({
        currentNetWorth: { label: '2024-03-15', assets: 0, liabilities: 0, netWorth: 0 },
      }),
    );

    render(<NetWorthPage />);
    expect(screen.getByText('No net worth data')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Filter by account purpose' })).toBeInTheDocument();
  });
});
