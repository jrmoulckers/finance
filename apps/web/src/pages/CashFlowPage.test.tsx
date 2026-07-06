// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for CashFlowPage component.
 *
 * Mocks the useCashFlow hook (not repositories) per project conventions.
 *
 * References: issue #1587
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CashFlowPage } from './CashFlowPage';

// Mock the hook
vi.mock('../hooks/useCashFlow', () => ({
  useCashFlow: vi.fn(),
}));

// Mock chart palette to avoid CSS var resolution in tests
vi.mock('../components/charts/chart-palette', () => ({
  CHART_COLORS: ['#648FFF', '#FE6100', '#785EF0', '#FFB000', '#DC267F', '#009E73'],
}));

// Mock the gig-earnings section (covered by its own tests) so this page test
// does not need the database-backed useGigPlatformEarnings hook.
vi.mock('../components/gig/GigPlatformEarningsSection', () => ({
  GigPlatformEarningsSection: () => null,
}));

import { useCashFlow } from '../hooks/useCashFlow';

const mockUseCashFlow = vi.mocked(useCashFlow);

describe('CashFlowPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner while loading', () => {
    mockUseCashFlow.mockReturnValue({
      aggregates: [],
      summary: {
        averageMonthlyIncome: 0,
        averageMonthlyExpenses: 0,
        averageMonthlyNetIncome: 0,
        totalIncome: 0,
        totalExpenses: 0,
        totalNetIncome: 0,
        monthCount: 0,
      },
      incomeSources: [],
      loading: true,
      error: null,
      refresh: vi.fn(),
      exportCsv: vi.fn(),
    });

    render(<CashFlowPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows error banner on error', () => {
    mockUseCashFlow.mockReturnValue({
      aggregates: [],
      summary: {
        averageMonthlyIncome: 0,
        averageMonthlyExpenses: 0,
        averageMonthlyNetIncome: 0,
        totalIncome: 0,
        totalExpenses: 0,
        totalNetIncome: 0,
        monthCount: 0,
      },
      incomeSources: [],
      loading: false,
      error: 'Database error',
      refresh: vi.fn(),
      exportCsv: vi.fn(),
    });

    render(<CashFlowPage />);
    expect(screen.getByText('Database error')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    mockUseCashFlow.mockReturnValue({
      aggregates: [],
      summary: {
        averageMonthlyIncome: 0,
        averageMonthlyExpenses: 0,
        averageMonthlyNetIncome: 0,
        totalIncome: 0,
        totalExpenses: 0,
        totalNetIncome: 0,
        monthCount: 0,
      },
      incomeSources: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
      exportCsv: vi.fn(),
    });

    render(<CashFlowPage />);
    expect(screen.getByText('No cash flow data')).toBeInTheDocument();
  });

  it('renders metrics and chart when data exists', () => {
    mockUseCashFlow.mockReturnValue({
      aggregates: [
        { month: '2024-01', income: 500000, expenses: 300000, netIncome: 200000 },
        { month: '2024-02', income: 600000, expenses: 350000, netIncome: 250000 },
      ],
      summary: {
        averageMonthlyIncome: 550000,
        averageMonthlyExpenses: 325000,
        averageMonthlyNetIncome: 225000,
        totalIncome: 1100000,
        totalExpenses: 650000,
        totalNetIncome: 450000,
        monthCount: 2,
      },
      incomeSources: [
        {
          categoryId: 'cat-salary',
          categoryName: 'Salary',
          amount: 1100000,
          transactionCount: 2,
          percentOfTotal: 100,
        },
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
      exportCsv: vi.fn(),
    });

    render(<CashFlowPage />);
    expect(screen.getByText('Cash Flow')).toBeInTheDocument();
    expect(screen.getByLabelText('Cash flow summary')).toBeInTheDocument();
    expect(screen.getByLabelText('Income vs expenses chart')).toBeInTheDocument();
    expect(screen.getByText('Income Sources')).toBeInTheDocument();
    expect(screen.getByText('Export CSV')).toBeInTheDocument();
  });

  it('renders period selector options', () => {
    mockUseCashFlow.mockReturnValue({
      aggregates: [{ month: '2024-01', income: 100000, expenses: 50000, netIncome: 50000 }],
      summary: {
        averageMonthlyIncome: 100000,
        averageMonthlyExpenses: 50000,
        averageMonthlyNetIncome: 50000,
        totalIncome: 100000,
        totalExpenses: 50000,
        totalNetIncome: 50000,
        monthCount: 1,
      },
      incomeSources: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
      exportCsv: vi.fn(),
    });

    render(<CashFlowPage />);
    expect(screen.getByRole('radiogroup', { name: 'Time period' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '6M' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '12M' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '24M' })).toBeInTheDocument();
  });

  // A two-month window where the multi-period cumulative net (800000) differs
  // from the current month's net (200000), so a seeding regression is visible.
  const twoMonthResult = {
    aggregates: [
      { month: '2024-01', income: 1000000, expenses: 400000, netIncome: 600000 },
      { month: '2024-02', income: 500000, expenses: 300000, netIncome: 200000 },
    ],
    summary: {
      averageMonthlyIncome: 750000,
      averageMonthlyExpenses: 350000,
      averageMonthlyNetIncome: 400000,
      totalIncome: 1500000,
      totalExpenses: 700000,
      totalNetIncome: 800000,
      monthCount: 2,
    },
    incomeSources: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    exportCsv: vi.fn(),
  } as ReturnType<typeof useCashFlow>;

  it('seeds the month-end forecast with the current month net, not the multi-period total', () => {
    mockUseCashFlow.mockReturnValue(twoMonthResult);

    render(<CashFlowPage />);

    // Current month net (200000) + remaining avg income (250000) − remaining
    // avg outflow (50000) = 400000 → $4,000.00. The old code seeded the forecast
    // with the 2-month cumulative net (800000), which produced $10,000.00.
    const projectedCard = screen.getByLabelText('Projected end-of-month balance');
    expect(within(projectedCard).getByText('$4,000.00')).toBeInTheDocument();
    expect(within(projectedCard).queryByText('$10,000.00')).not.toBeInTheDocument();
  });

  it('exposes an accessible data table alternative for the income vs. expenses chart', () => {
    mockUseCashFlow.mockReturnValue(twoMonthResult);

    render(<CashFlowPage />);

    const table = screen.getByRole('table', { name: /monthly income versus expenses/i });
    expect(within(table).getByRole('columnheader', { name: 'Income' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Expenses' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Net' })).toBeInTheDocument();

    // The February row exposes the same figures the bars encode visually.
    expect(within(table).getByRole('rowheader', { name: '2024-02' })).toBeInTheDocument();
    expect(within(table).getByText('$5,000.00')).toBeInTheDocument(); // income
    expect(within(table).getByText('$3,000.00')).toBeInTheDocument(); // expenses
    expect(within(table).getByText('$2,000.00')).toBeInTheDocument(); // net
  });
});
