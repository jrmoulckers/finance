// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { WeeklyDigest } from '../components/insights';
import { RecommendationsFeed } from '../components/recommendations';
import { WellnessOverview } from '../components/wellness';
import { EmptyState, ErrorBanner, LoadingSpinner } from '../components/common';
import { useRecommendations } from '../hooks/useRecommendations';
import { useWealthInsights } from '../hooks/useWealthInsights';
import './InsightsPage.css';

function isDigestEmpty(
  netWorth: number,
  spending: number,
  income: number,
  goalCount: number,
): boolean {
  return netWorth === 0 && spending === 0 && income === 0 && goalCount === 0;
}

function isWellnessEmpty(wellness: ReturnType<typeof useWealthInsights>['wellness']): boolean {
  return (
    !wellness ||
    (wellness.anxietyScore.score === 0 &&
      wellness.moodCorrelation.entriesTagged === 0 &&
      wellness.stressIndicators.indicators.length === 0)
  );
}

export const InsightsPage: React.FC = () => {
  const { digest, wellness, activePeriod, setActivePeriod, loading, error, refresh } =
    useWealthInsights();
  const {
    recommendations,
    summary: recommendationSummary,
    loading: recommendationsLoading,
    error: recommendationsError,
    refresh: refreshRecommendations,
  } = useRecommendations(6);

  if (loading) {
    return (
      <div className="wealth-insights-page__loading">
        <LoadingSpinner label="Loading wealth insights" />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={refresh} />;
  }

  if (
    !digest ||
    (isDigestEmpty(
      digest.netWorth.current,
      digest.spending.totalCurrentSpending,
      digest.savingsRate.currentIncome,
      digest.goals.length,
    ) &&
      isWellnessEmpty(wellness))
  ) {
    return (
      <EmptyState
        title="No wealth insights yet"
        description="Add accounts, transactions, budgets, or goals to generate your personalized digest."
      />
    );
  }

  return (
    <div className="wealth-insights-page">
      <WeeklyDigest digest={digest} activePeriod={activePeriod} onPeriodChange={setActivePeriod} />
      <RecommendationsFeed
        recommendations={recommendations}
        summary={recommendationSummary}
        loading={recommendationsLoading}
        error={recommendationsError}
        onRetry={refreshRecommendations}
      />
      {wellness ? <WellnessOverview overview={wellness} /> : null}
    </div>
  );
};

export default InsightsPage;
