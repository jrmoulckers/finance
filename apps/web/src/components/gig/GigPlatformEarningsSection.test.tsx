// SPDX-License-Identifier: BUSL-1.1

/**
 * Render tests for GigPlatformEarningsSection.
 *
 * Mocks the useGigPlatformEarnings hook (not repositories) per project
 * conventions. Reconciliation/percent helpers run for real (pure functions).
 *
 * References: issue #2133
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('../../hooks/useGigPlatformEarnings', () => ({
  useGigPlatformEarnings: vi.fn(),
}));

vi.mock('../charts/chart-palette', () => ({
  CHART_COLORS: ['#648FFF', '#FE6100', '#785EF0', '#FFB000', '#DC267F', '#009E73'],
}));

import { GigPlatformEarningsSection } from './GigPlatformEarningsSection';
import { useGigPlatformEarnings } from '../../hooks/useGigPlatformEarnings';
import type { UseGigPlatformEarningsResult } from '../../hooks/useGigPlatformEarnings';

const mockHook = vi.mocked(useGigPlatformEarnings);

function baseResult(
  overrides: Partial<UseGigPlatformEarningsResult> = {},
): UseGigPlatformEarningsResult {
  return {
    earnings: {
      platforms: [
        {
          platform: 'Uber',
          amounts: { today: 5000, week: 8000, month: 12000 },
          counts: { today: 1, week: 2, month: 3 },
        },
        {
          platform: 'DoorDash',
          amounts: { today: 0, week: 2000, month: 6000 },
          counts: { today: 0, week: 1, month: 2 },
        },
      ],
      combined: { today: 5000, week: 10000, month: 18000 },
      combinedCounts: { today: 1, week: 3, month: 5 },
    },
    rules: [
      {
        id: 'builtin-uber',
        platform: 'Uber',
        matchField: 'any',
        keywords: ['uber'],
        enabled: true,
        isBuiltIn: true,
        createdAt: '1970-01-01T00:00:00.000Z',
      },
    ],
    expectedPayouts: { Uber: 12000 },
    knownPlatforms: ['DoorDash', 'Uber'],
    loading: false,
    error: null,
    refresh: vi.fn(),
    addRule: vi.fn(),
    toggleRule: vi.fn(),
    removeRule: vi.fn(),
    setExpectedPayout: vi.fn(),
    ...overrides,
  };
}

describe('GigPlatformEarningsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state', () => {
    mockHook.mockReturnValue(baseResult({ loading: true }));
    render(<GigPlatformEarningsSection />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error alert', () => {
    mockHook.mockReturnValue(baseResult({ loading: false, error: 'boom' }));
    render(<GigPlatformEarningsSection />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('renders the heading, period tabs and combined live region', () => {
    mockHook.mockReturnValue(baseResult());
    render(<GigPlatformEarningsSection />);
    expect(screen.getByRole('heading', { name: 'Gig Platform Earnings' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'This week' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'This month' })).toBeInTheDocument();
    // combined total lives in an aria-live region
    expect(screen.getByText(/Combined today earnings:/i)).toBeInTheDocument();
  });

  it('renders the by-platform breakdown', () => {
    mockHook.mockReturnValue(baseResult());
    render(<GigPlatformEarningsSection />);
    const list = screen.getByRole('list', { name: 'Earnings by gig platform' });
    expect(within(list).getByText('Uber')).toBeInTheDocument();
    expect(within(list).getByText('DoorDash')).toBeInTheDocument();
    // progressbars carry a text alternative for the bar
    expect(
      screen.getByRole('progressbar', { name: /Uber: \d+% of gig earnings/ }),
    ).toBeInTheDocument();
  });

  it('switches period when a tab is clicked and updates reconciliation caption', () => {
    mockHook.mockReturnValue(baseResult());
    render(<GigPlatformEarningsSection />);
    // default period today → reconciliation caption mentions today
    expect(screen.getByText(/deposit received \(today\)/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'This month' }));
    expect(screen.getByRole('tab', { name: 'This month' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText(/deposit received \(this month\)/i)).toBeInTheDocument();
  });

  it('filters the breakdown by platform', () => {
    mockHook.mockReturnValue(baseResult());
    render(<GigPlatformEarningsSection />);
    const filter = screen.getByLabelText('Filter by platform');
    fireEvent.change(filter, { target: { value: 'Uber' } });
    const list = screen.getByRole('list', { name: 'Earnings by gig platform' });
    expect(within(list).getByText('Uber')).toBeInTheDocument();
    expect(within(list).queryByText('DoorDash')).not.toBeInTheDocument();
  });

  it('renders a reconciliation table with status and an editable expected input', () => {
    mockHook.mockReturnValue(baseResult());
    render(<GigPlatformEarningsSection />);
    const table = screen.getByRole('table');
    // Uber expected 12000c vs received today 5000c → Short
    expect(within(table).getByText('Short')).toBeInTheDocument();
    expect(screen.getByLabelText('Expected payout for Uber')).toBeInTheDocument();
  });

  it('commits an expected-payout edit on blur', () => {
    const setExpectedPayout = vi.fn();
    mockHook.mockReturnValue(baseResult({ setExpectedPayout }));
    render(<GigPlatformEarningsSection />);
    const input = screen.getByLabelText('Expected payout for Uber');
    fireEvent.change(input, { target: { value: '75.50' } });
    fireEvent.blur(input);
    expect(setExpectedPayout).toHaveBeenCalledWith('Uber', 7550);
  });

  it('exposes a rule manager disclosure with the mapping rules', () => {
    mockHook.mockReturnValue(baseResult());
    render(<GigPlatformEarningsSection />);
    expect(screen.getByText('Manage platform mapping rules')).toBeInTheDocument();
    const ruleList = screen.getByRole('list', { name: 'Platform mapping rules' });
    expect(within(ruleList).getByText('Uber')).toBeInTheDocument();
    expect(screen.getByLabelText('Add a platform mapping rule')).toBeInTheDocument();
  });

  it('adds a rule through the form', () => {
    const addRule = vi.fn().mockReturnValue({ id: 'x' });
    mockHook.mockReturnValue(baseResult({ addRule }));
    render(<GigPlatformEarningsSection />);
    fireEvent.change(screen.getByLabelText('Platform name'), { target: { value: 'Shipt' } });
    fireEvent.change(screen.getByLabelText('Keywords (comma separated)'), {
      target: { value: 'shipt, shopt' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    expect(addRule).toHaveBeenCalledWith({
      platform: 'Shipt',
      matchField: 'any',
      keywords: ['shipt', 'shopt'],
    });
  });
});
