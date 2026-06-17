// SPDX-License-Identifier: BUSL-1.1

import React, { useState } from 'react';
import { EmptyState } from '../common/EmptyState';
import { ErrorBanner } from '../common/ErrorBanner';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AppIcon } from '../icons';
import type { PersonalizedRecommendation, RecommendationSummary } from '../../lib/recommendations';
import { RecommendationCard } from './RecommendationCard';
import { RecommendationDetail } from './RecommendationDetail';
import './recommendations.css';

export interface RecommendationsFeedProps {
  readonly recommendations: readonly PersonalizedRecommendation[];
  readonly summary: RecommendationSummary;
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly onRetry?: () => void;
  readonly className?: string;
}

export const RecommendationsFeed: React.FC<RecommendationsFeedProps> = ({
  recommendations,
  summary,
  loading = false,
  error = null,
  onRetry,
  className = '',
}) => {
  const [selectedRecommendation, setSelectedRecommendation] =
    useState<PersonalizedRecommendation | null>(null);

  if (loading && recommendations.length === 0) {
    return (
      <div className="recommendations-feed__loading">
        <LoadingSpinner label="Loading recommendations" />
      </div>
    );
  }

  if (error && recommendations.length === 0) {
    return <ErrorBanner message={error} onRetry={onRetry} />;
  }

  if (recommendations.length === 0) {
    return (
      <EmptyState
        icon={<AppIcon name="sparkles" size={24} />}
        title="No recommendations yet"
        description="Add more local transactions, budgets, or goals so the recommendation engine can spot patterns."
      />
    );
  }

  return (
    <section
      className={`recommendations-feed ${className}`.trim()}
      aria-label="Personalized recommendations"
    >
      <div className="recommendations-feed__header">
        <div>
          <p className="recommendations-feed__eyebrow">Local-first AI recommendations</p>
          <h3 className="recommendations-feed__title">Recommended next moves</h3>
          <p className="recommendations-feed__subtitle">
            {summary.totalCount} active recommendation{summary.totalCount === 1 ? '' : 's'}
            {summary.estimatedMonthlySavingsCents > 0
              ? ` · up to ${(summary.estimatedMonthlySavingsCents / 100).toLocaleString('en-US', {
                  style: 'currency',
                  currency: recommendations[0]?.currencyCode ?? 'USD',
                  maximumFractionDigits: 0,
                })} per month in upside`
              : ''}
          </p>
        </div>
        <div className="recommendations-feed__counts" aria-label="Recommendation priority counts">
          <span>{summary.criticalCount} critical</span>
          <span>{summary.highCount} high</span>
        </div>
      </div>

      {error ? <ErrorBanner message={error} onRetry={onRetry} /> : null}

      <div className="recommendations-feed__list" role="list">
        {recommendations.map((recommendation) => (
          <div key={recommendation.id} role="listitem">
            <RecommendationCard
              recommendation={recommendation}
              onOpen={(nextRecommendation) => setSelectedRecommendation(nextRecommendation)}
            />
          </div>
        ))}
      </div>

      <RecommendationDetail
        recommendation={selectedRecommendation}
        onClose={() => setSelectedRecommendation(null)}
      />
    </section>
  );
};
