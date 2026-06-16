// SPDX-License-Identifier: BUSL-1.1

import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { InsightsPage } from './InsightsPage';
import type { CategorySpending, UseInsightsResult } from '../hooks/useInsights';

vi.mock('../hooks/useInsights', async () => {
  const actual = await vi.importActual('../hooks/useInsights');
  return {
    ...actual,
    useInsights: vi.fn(),
  };
});

import { calculateSpendingBenchmarks, useInsights } from '../hooks/useInsights';
const mockedUseInsights = vi.mocked(useInsights);

const baseCategorySpending: CategorySpending[] = [
  {
    categoryId: 'cat-1',
    categoryName: 'Housing',
    amount: 30000,
    transactionCount: 3,
    percentOfTotal: 30,
  },
  {
    categoryId: 'cat-2',
    categoryName: 'Food & Dining',
    amount: 25000,
    transactionCount: 10,
    percentOfTotal: 25,
  },
  {
    categoryId: 'cat-3',
    categoryName: 'Transportation',
    amount: 15000,
    transactionCount: 5,
    percentOfTotal: 15,
  },
  {
    categoryId: 'cat-4',
    categoryName: 'Utilities',
    amount: 10000,
    transactionCount: 4,
    percentOfTotal: 10,
  },
  {
    categoryId: 'cat-5',
    categoryName: 'Entertainment',
    amount: 10000,
    transactionCount: 4,
    percentOfTotal: 10,
  },
  {
    categoryId: 'cat-6',
    categoryName: 'Shopping',
    amount: 10000,
    transactionCount: 4,
    percentOfTotal: 10,
  },
];

const makeInsightsData = (
  overrides: Partial<UseInsightsResult['insights']> = {},
): UseInsightsResult['insights'] => {
  const totalIncomeThisMonth = 200000;
  const savingsRate = 50;
  const benchmarkData = calculateSpendingBenchmarks(
    baseCategorySpending,
    totalIncomeThisMonth,
    savingsRate,
  );

  return {
    categorySpending: baseCategorySpending,
    dailySpending: [
      { date: '2025-01-01', amount: 5000 },
      { date: '2025-01-02', amount: 8000 },
    ],
    previousDailySpending: [{ date: '2024-12-01', amount: 6000 }],
    totalSpentThisMonth: 100000,
    totalSpentLastMonth: 80000,
    totalIncomeThisMonth,
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
    topCategories: baseCategorySpending.slice(0, 2),
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
    savingsRate,
    ...benchmarkData,
    ...overrides,
  };
};

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

    const categorySection = screen.getByLabelText('Spending by category');
    expect(categorySection).toBeInTheDocument();
    expect(within(categorySection).getByText('Housing')).toBeInTheDocument();
    expect(within(categorySection).getByText('Food & Dining')).toBeInTheDocument();
  });

  it('renders spending benchmarks comparison section', () => {
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

    expect(screen.getByLabelText('How do I compare')).toBeInTheDocument();
    expect(screen.getByText('How Do I Compare?')).toBeInTheDocument();
    expect(screen.getByLabelText('Financial Health Score')).toBeInTheDocument();
    expect(screen.getByLabelText('50/30/20 rule')).toBeInTheDocument();
    expect(screen.getByText(/You spend 13% on food/i)).toBeInTheDocument();
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

    expect(screen.getByText('25% vs last month')).toBeInTheDocument();
  });
});

describe('calculateSpendingBenchmarks', () => {
  it('classifies benchmark status and computes financial health score', () => {
    const result = calculateSpendingBenchmarks(
      [
        {
          categoryId: 'housing',
          categoryName: 'Housing',
          amount: 42000,
          transactionCount: 1,
          percentOfTotal: 42,
        },
        {
          categoryId: 'food',
          categoryName: 'Food & Dining',
          amount: 18000,
          transactionCount: 2,
          percentOfTotal: 18,
        },
        {
          categoryId: 'transport',
          categoryName: 'Transportation',
          amount: 12000,
          transactionCount: 2,
          percentOfTotal: 12,
        },
      ],
      100000,
      8,
    );

    const housing = result.spendingBenchmarks.find((benchmark) => benchmark.key === 'housing');
    const food = result.spendingBenchmarks.find((benchmark) => benchmark.key === 'food');
    const savings = result.spendingBenchmarks.find((benchmark) => benchmark.key === 'savings');

    expect(housing).toMatchObject({
      userPercent: 42,
      status: 'danger',
      isOnTrack: false,
    });
    expect(housing?.summary).toContain('significantly above');

    expect(food).toMatchObject({
      userPercent: 18,
      status: 'warning',
      isOnTrack: false,
    });
    expect(food?.summary).toContain('slightly above');

    expect(savings).toMatchObject({
      userPercent: 8,
      status: 'warning',
      isOnTrack: false,
    });
    expect(savings?.summary).toContain('slightly below');

    expect(result.financialHealthScore).toMatchObject({
      score: 5,
      total: 8,
      percent: 63,
      label: 'Good',
    });
    expect(result.budgetRuleOverview.summary).toContain('needs near 50%');
  });
});
