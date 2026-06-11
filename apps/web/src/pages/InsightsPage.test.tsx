// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { InsightsPage } from './InsightsPage';
import type { UseWealthInsightsResult } from '../hooks/useWealthInsights';

vi.mock('@fluentui/react-icons', () => ({}));

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
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
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

    expect(screen.getByText('Weekly digest')).toBeTruthy();
    expect(screen.getByText('Recommendations feed')).toBeTruthy();
    expect(screen.getByText('Mood correlation + anxiety snapshot')).toBeTruthy();
    expect(screen.getByText('Financial anxiety score')).toBeTruthy();
    expect(screen.getByText('Stress alerts')).toBeTruthy();
  });
});
