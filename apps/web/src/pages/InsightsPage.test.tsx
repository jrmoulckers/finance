// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { InsightsPage } from './InsightsPage';
import type { UseInsightsResult } from '../hooks/useInsights';

vi.mock('../hooks/useInsights', () => ({
  useInsights: vi.fn(),
}));

import { useInsights } from '../hooks/useInsights';
const mockedUseInsights = vi.mocked(useInsights);

const makeInsightsData = (
  overrides: Partial<UseInsightsResult['insights']> = {},
): UseInsightsResult['insights'] => ({
  categorySpending: [
    {
      categoryId: 'cat-1',
      categoryName: 'Food',
      amount: 50000,
      transactionCount: 10,
      percentOfTotal: 50,
    },
    {
      categoryId: 'cat-2',
      categoryName: 'Transport',
      amount: 30000,
      transactionCount: 5,
      percentOfTotal: 30,
    },
    {
      categoryId: 'cat-3',
      categoryName: 'Entertainment',
      amount: 20000,
      transactionCount: 3,
      percentOfTotal: 20,
    },
  ],
  dailySpending: [
    { date: '2025-01-01', amount: 5000 },
    { date: '2025-01-02', amount: 8000 },
  ],
  previousDailySpending: [{ date: '2024-12-01', amount: 6000 }],
  totalSpentThisMonth: 100000,
  totalSpentLastMonth: 80000,
  totalIncomeThisMonth: 200000,
  totalIncomeLastMonth: 180000,
  spendingComparison: {
    current: 100000,
    previous: 80000,
    changePercent: 25,
    direction: 'up',
  },
  incomeComparison: {
    current: 200000,
    previous: 180000,
    changePercent: 11,
    direction: 'up',
  },
  topCategories: [
    {
      categoryId: 'cat-1',
      categoryName: 'Food',
      amount: 50000,
      transactionCount: 10,
      percentOfTotal: 50,
    },
    {
      categoryId: 'cat-2',
      categoryName: 'Transport',
      amount: 30000,
      transactionCount: 5,
      percentOfTotal: 30,
    },
  ],
  averageDailySpending: 5000,
  recommendations: [
    {
      id: 'spending-increased',
      title: 'Spending increased significantly',
      description: 'Your spending is up 25% compared to last month.',
      severity: 'warning',
    },
    {
      id: 'high-savings-rate',
      title: 'Excellent savings rate!',
      description: "You're saving 50% of your income.",
      severity: 'success',
    },
  ],
  netCashFlow: 100000,
  savingsRate: 50,
  ...overrides,
});

describe('InsightsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading spinner when loading', () => {
    mockedUseInsights.mockReturnValue({
      insights: null,
      loading: true,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <InsightsPage />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Loading insights')).toBeInTheDocument();
  });

  it('renders error banner when there is an error', () => {
    mockedUseInsights.mockReturnValue({
      insights: null,
      loading: false,
      error: 'Database error',
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <InsightsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Database error')).toBeInTheDocument();
  });

  it('renders empty state when no data', () => {
    mockedUseInsights.mockReturnValue({
      insights: makeInsightsData({
        totalSpentThisMonth: 0,
        totalIncomeThisMonth: 0,
        categorySpending: [],
        dailySpending: [],
      }),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <InsightsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('No insights yet')).toBeInTheDocument();
  });

  it('renders key metrics section', () => {
    mockedUseInsights.mockReturnValue({
      insights: makeInsightsData(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <InsightsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Financial Insights')).toBeInTheDocument();
    expect(screen.getByLabelText('Key metrics')).toBeInTheDocument();
    expect(screen.getByText('Spent This Month')).toBeInTheDocument();
    expect(screen.getByText('Income This Month')).toBeInTheDocument();
    expect(screen.getByText('Net Cash Flow')).toBeInTheDocument();
    expect(screen.getByText('Savings Rate')).toBeInTheDocument();
    // The savings rate "50%" appears both in metric card and category bar,
    // so use getAllByText to avoid ambiguity
    const savingsRateCard = screen.getByLabelText('Savings Rate');
    expect(savingsRateCard).toHaveTextContent('50%');
  });

  it('renders top spending categories', () => {
    mockedUseInsights.mockReturnValue({
      insights: makeInsightsData(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <InsightsPage />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Spending by category')).toBeInTheDocument();
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('Transport')).toBeInTheDocument();
  });

  it('renders recommendations', () => {
    mockedUseInsights.mockReturnValue({
      insights: makeInsightsData(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <InsightsPage />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Recommendations')).toBeInTheDocument();
    expect(screen.getByText('Spending increased significantly')).toBeInTheDocument();
    expect(screen.getByText('Excellent savings rate!')).toBeInTheDocument();
  });

  it('renders daily spending trend section', () => {
    mockedUseInsights.mockReturnValue({
      insights: makeInsightsData(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <InsightsPage />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Daily spending trend')).toBeInTheDocument();
  });

  it('renders month comparison section', () => {
    mockedUseInsights.mockReturnValue({
      insights: makeInsightsData(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <InsightsPage />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Month comparison')).toBeInTheDocument();
    expect(screen.getByText('Last Month Spending')).toBeInTheDocument();
    expect(screen.getByText('This Month Spending')).toBeInTheDocument();
  });

  it('renders comparison direction indicators', () => {
    mockedUseInsights.mockReturnValue({
      insights: makeInsightsData(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <InsightsPage />
      </MemoryRouter>,
    );

    // Spending comparison is "up" by 25%
    expect(screen.getByText('25% vs last month')).toBeInTheDocument();
  });
});
