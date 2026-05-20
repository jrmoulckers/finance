// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for CashFlowPage component.
 *
 * Mocks the useCashFlow hook (not repositories) per project conventions.
 *
 * References: issue #1587
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CashFlowPage } from './CashFlowPage';

// Mock the hook
vi.mock('../hooks/useCashFlow', () => ({
  useCashFlow: vi.fn(),
}));

// Mock chart palette to avoid CSS var resolution in tests
vi.mock('../components/charts/chart-palette', () => ({
  CHART_COLORS: ['#648FFF', '#FE6100', '#785EF0', '#FFB000', '#DC267F', '#009E73'],
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

  it('renders period selector tabs', () => {
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
    expect(screen.getByRole('tab', { name: '6M' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '12M' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '24M' })).toBeInTheDocument();
  });
});
