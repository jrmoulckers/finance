// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { InsightsPage } from './InsightsPage';
import type { ReactNode } from 'react';
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
    spendingTrends: [
      {
        periodMonths: 6,
        insufficientData: false,
        monthlyTotals: [{ month: '2025-01', total: 100000, topCategories: [] }],
        seasonality: [],
        pacing: {
          currentMonth: '2025-01',
          spentSoFar: 100000,
          projectedSpend: 100000,
          historicalAverage: 90000,
          direction: 'normal',
          summary: 'Current month pacing is close to the historical same-month average.',
        },
        actionableCopy: [],
      },
    ],
    categoryDrillDowns: [
      {
        categoryId: 'cat-1',
        categoryName: 'Housing',
        total: 30000,
        transactionCount: 1,
        averageTransaction: 30000,
        largestTransaction: {
          id: 'tx-1',
          date: '2025-01-05',
          payee: 'Rent',
          accountName: 'Checking',
          amount: 30000,
          tags: ['home'],
          note: 'January rent',
        },
        transactions: [
          {
            id: 'tx-1',
            date: '2025-01-05',
            payee: 'Rent',
            accountName: 'Checking',
            amount: 30000,
            tags: ['home'],
            note: 'January rent',
          },
        ],
      },
    ],
    annualSummaries: [
      {
        year: 2025,
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        monthCount: 1,
        isPartialYear: true,
        totalIncome: 200000,
        totalExpenses: 100000,
        savingsRate: 50,
        netCashFlow: 100000,
        netWorthChange: 100000,
        topCategories: [{ categoryName: 'Housing', amount: 30000, transactionCount: 1 }],
        biggestChanges: [],
        highlights: ['You finished the year cash-flow positive.'],
        cautions: [],
        csvRows: [{ Metric: 'Total income', Amount: 200000 }],
      },
    ],
    ...overrides,
  };
};
import type { UseWealthInsightsResult } from '../hooks/useWealthInsights';

vi.mock('../hooks/useWealthInsights', () => ({
  useWealthInsights: vi.fn(),
}));

vi.mock('../hooks/useRecommendations', () => ({
  useRecommendations: vi.fn(),
}));

vi.mock('../components/insights', () => ({
  WeeklyDigest: () => <div>Weekly digest</div>,
}));

vi.mock('../components/recommendations', () => ({
  RecommendationsFeed: () => <div>Recommendations feed</div>,
}));

vi.mock('../components/wellness', () => ({
  WellnessOverview: () => (
    <div>
      <div>Mood correlation + anxiety snapshot</div>
      <div>Financial anxiety score</div>
      <div>Stress alerts</div>
    </div>
  ),
}));

vi.mock('../components/common', () => ({
  CurrencyDisplay: ({ amount }: { amount: number }) => <span>{amount}</span>,
  EmptyState: ({ title, action }: { title: string; action?: ReactNode }) => (
    <div>
      {title}
      {action}
    </div>
  ),
  ErrorBanner: ({ message }: { message: string }) => <div>{message}</div>,
  LoadingSpinner: ({ label }: { label: string }) => <div aria-label={label} />,
}));

import { useRecommendations } from '../hooks/useRecommendations';
import { useWealthInsights } from '../hooks/useWealthInsights';
const mockedUseRecommendations = vi.mocked(useRecommendations);
const mockedUseWealthInsights = vi.mocked(useWealthInsights);

function makeDigest(): NonNullable<UseWealthInsightsResult['digest']> {
  return {
    period: 'weekly',
    currencyCode: 'USD',
    generatedAt: '2025-01-20T12:00:00.000Z',
    netWorth: {
      current: 250_000,
      previous: 225_000,
      assets: 300_000,
      liabilities: 50_000,
      change: { amount: 25_000, percent: 11.1, direction: 'up' },
      history: [
        {
          label: 'Jan 13',
          startDate: '2025-01-07',
          endDate: '2025-01-13',
          netWorth: 225_000,
          income: 80_000,
          spending: 40_000,
          savingsRate: 50,
        },
        {
          label: 'Jan 20',
          startDate: '2025-01-14',
          endDate: '2025-01-20',
          netWorth: 250_000,
          income: 90_000,
          spending: 45_000,
          savingsRate: 50,
        },
      ],
    },
    spending: {
      totalCurrentSpending: 60_000,
      totalPreviousSpending: 50_000,
      change: { amount: 10_000, percent: 20, direction: 'up' },
      topCategories: [
        {
          categoryId: 'food',
          categoryName: 'Food',
          currentAmount: 25_000,
          previousAmount: 18_000,
          shareOfSpending: 42,
          change: { amount: 7_000, percent: 38.9, direction: 'up' },
        },
      ],
    },
    savingsRate: {
      currentRate: 22,
      previousRate: 18,
      rateChangePoints: 4,
      change: { amount: 4, percent: 22.2, direction: 'up' },
      currentIncome: 120_000,
      currentSpending: 60_000,
      currentSavings: 60_000,
      history: [],
    },
    goals: [
      {
        id: 'goal-1',
        name: 'Emergency fund',
        status: 'ACTIVE',
        progressPercent: 68,
        targetAmount: 200_000,
        currentAmount: 136_000,
        remainingAmount: 64_000,
        targetDate: '2025-06-01',
        pace: 'on-track',
        monthlyContributionNeeded: 16_000,
      },
    ],
    healthScore: {
      score: 82,
      label: 'Strong',
      breakdown: {
        savingsRate: 25,
        budgetAdherence: 20,
        emergencyFund: 17.5,
        debtToIncome: 20,
      },
      metrics: {
        savingsRate: 22,
        onTrackBudgetRatio: 0.8,
        monthsOfExpensesSaved: 3.5,
        debtToIncomeRatio: 19,
      },
    },
    alignmentSnapshot: {
      categories: [
        {
          categoryId: 'savings',
          categoryName: 'Savings & investing',
          amount: 60_000,
          source: 'savings',
          allocations: [
            { valueId: 'security', weight: 0.6 },
            { valueId: 'freedom', weight: 0.25 },
            { valueId: 'growth', weight: 0.15 },
          ],
        },
        {
          categoryId: 'groceries',
          categoryName: 'Groceries',
          amount: 24_000,
          source: 'expense',
          allocations: [
            { valueId: 'health', weight: 0.55 },
            { valueId: 'family', weight: 0.45 },
          ],
        },
      ],
      totalInputAmount: 84_000,
      totalMappedAmount: 84_000,
      unmappedAmount: 0,
    },
    highlights: [
      {
        id: 'net-worth-growth',
        title: 'Your net worth moved in the right direction',
        description:
          '11.1% week-over-week growth suggests your current habits are compounding well.',
        tone: 'success',
        icon: 'trending-up',
        actionLabel: 'View net worth',
        actionHref: '/net-worth',
      },
    ],
  };
}

function makeWellness(): NonNullable<UseWealthInsightsResult['wellness']> {
  return {
    currencyCode: 'USD',
    generatedAt: '2025-01-20T12:00:00.000Z',
    anxietyScore: {
      score: 41,
      level: 'moderate',
      summary: 'There are a few signs of financial strain, led by upcoming bill pressure.',
      breakdown: {
        overdraftProximity: 8,
        spendingVolatility: 9,
        billStress: 12,
        debtPressure: 6,
        savingsTrajectory: 6,
      },
      metrics: {
        liquidBufferDays: 18,
        spendingVolatilityRatio: 0.7,
        billCoverageRatio: 1.2,
        minimumPaymentRatio: 9,
        savingsRateChange: -4,
        overdueBills: 0,
      },
    },
    moodCorrelation: {
      hasEnoughData: true,
      summary: 'Higher-stress moods are lining up with larger purchases.',
      entriesTagged: 4,
      correlation: 0.5,
      dominantMoodState: 'stressed',
      averageTaggedSpending: 8_500,
      spikeCount: 2,
      dropCount: 1,
      chart: [
        {
          date: '2025-01-04',
          label: 'Jan 4',
          spending: 4_000,
          baseline: 6_000,
          moodState: 'calm',
          moodLabel: 'Calm',
          moodScore: 15,
          transactionCount: 1,
          isSpike: false,
          isDrop: true,
        },
        {
          date: '2025-01-08',
          label: 'Jan 8',
          spending: 11_000,
          baseline: 6_000,
          moodState: 'stressed',
          moodLabel: 'Stressed',
          moodScore: 90,
          transactionCount: 1,
          isSpike: true,
          isDrop: false,
        },
      ],
      patterns: [
        {
          id: 'stressed-spike',
          moodState: 'stressed',
          direction: 'spike',
          title: 'Stressed spending tends to spike',
          description: 'Transactions tagged stressed average 40% above your typical expense size.',
          intensity: 'high',
          averageSpending: 11_000,
          occurrences: 2,
        },
      ],
    },
    stressIndicators: {
      highestLevel: 'moderate',
      summary: 'Detected 1 stress signal to keep an eye on over the next few weeks.',
      indicators: [
        {
          kind: 'bill-crunch',
          level: 'moderate',
          signal: 42,
          title: 'Bill timing is feeling tight',
          description:
            'Upcoming bills in the next two weeks are close to your available liquid balance.',
          recommendation:
            'Review due dates and spread large bills across upcoming pay cycles if possible.',
        },
      ],
    },
  };
}

describe('InsightsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseInsights.mockReturnValue({
      insights: makeInsightsData(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    const defaultDigest = makeDigest();
    mockedUseWealthInsights.mockReturnValue({
      digest: defaultDigest,
      digests: { weekly: defaultDigest },
      wellness: makeWellness(),
      activePeriod: 'weekly',
      setActivePeriod: vi.fn(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    mockedUseRecommendations.mockReturnValue({
      recommendations: [],
      summary: {
        totalCount: 0,
        criticalCount: 0,
        highCount: 0,
        estimatedMonthlySavingsCents: 0,
        lastAnalyzedAt: '2025-01-20T12:00:00.000Z',
      },
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
  });

  it('renders loading state', () => {
    mockedUseWealthInsights.mockReturnValue({
      digest: null,
      digests: {},
      wellness: null,
      activePeriod: 'weekly',
      setActivePeriod: vi.fn(),
      loading: true,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <InsightsPage />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Loading wealth insights')).toBeTruthy();
  });

  it('renders error state', () => {
    mockedUseWealthInsights.mockReturnValue({
      digest: null,
      digests: {},
      wellness: null,
      activePeriod: 'weekly',
      setActivePeriod: vi.fn(),
      loading: false,
      error: 'Failed to compute digest',
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <InsightsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Failed to compute digest')).toBeTruthy();
  });

  it('renders empty state when digest has no meaningful data', () => {
    const digest = makeDigest();
    mockedUseInsights.mockReturnValue({
      insights: null,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    mockedUseWealthInsights.mockReturnValue({
      digest: {
        ...digest,
        netWorth: { ...digest.netWorth, current: 0 },
        spending: { ...digest.spending, totalCurrentSpending: 0, topCategories: [] },
        savingsRate: { ...digest.savingsRate, currentIncome: 0 },
        goals: [],
      },
      digests: {},
      wellness: null,
      activePeriod: 'weekly',
      setActivePeriod: vi.fn(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <InsightsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('No wealth insights yet')).toBeTruthy();
    expect(screen.getByRole('link', { name: /add your first account/i })).toHaveAttribute(
      'href',
      '/accounts',
    );
  });

  it('renders the wealth digest experience', () => {
    const digest = makeDigest();
    const wellness = makeWellness();
    mockedUseWealthInsights.mockReturnValue({
      digest,
      digests: { weekly: digest },
      wellness,
      activePeriod: 'weekly',
      setActivePeriod: vi.fn(),
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
    expect(screen.getByText('Weekly digest')).toBeTruthy();
    expect(screen.getByText('Recommendations feed')).toBeTruthy();
    expect(screen.getByText('Mood correlation + anxiety snapshot')).toBeTruthy();
    expect(screen.getByText('Financial anxiety score')).toBeTruthy();
    expect(screen.getByText('Stress alerts')).toBeTruthy();
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

  it('keeps peer comparisons opt-in and then renders category peer cards', () => {
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

    const peerSection = screen.getByLabelText('Peer comparisons');
    expect(
      within(peerSection).getByText(
        'Current benchmark cards stay available without peer comparison opt-in.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      within(peerSection).getByRole('button', { name: 'Opt in to peer comparisons' }),
    );

    expect(within(peerSection).getByText('Clear peer profile')).toBeInTheDocument();
    expect(
      within(peerSection).getByLabelText(/Housing: 15% of income, peer range/i),
    ).toBeInTheDocument();
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
