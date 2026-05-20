// SPDX-License-Identifier: BUSL-1.1

/**
 * SubscriptionsPage — Subscription rationalization dashboard.
 *
 * Detects recurring transactions, groups as subscriptions, shows total
 * monthly/annual costs, category breakdown, and cancel/keep tracking.
 *
 * Accessibility:
 * - Section landmarks with aria-label
 * - List items with descriptive aria-labels
 * - Status buttons are keyboard-accessible
 * - Live region for summary updates
 *
 * References: issue #1593
 */

import React from 'react';
import { CurrencyDisplay, EmptyState, ErrorBanner, LoadingSpinner } from '../components/common';
import { useSubscriptions } from '../hooks/useSubscriptions';
import type {
  DetectedSubscription,
  SubscriptionCategoryGroup,
} from '../lib/analytics/subscriptions';
import { CHART_COLORS } from '../components/charts/chart-palette';
import './analytics.css';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const CADENCE_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  annual: 'Annual',
  other: 'Other',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Keep',
  flagged: 'Flagged',
  cancelled: 'Cancelled',
};

interface SubscriptionCardProps {
  subscription: DetectedSubscription;
  onToggleStatus: () => void;
}

const SubscriptionCard: React.FC<SubscriptionCardProps> = ({ subscription, onToggleStatus }) => (
  <article
    className={`analytics-subscription-card analytics-subscription-card--${subscription.status}`}
    aria-label={`${subscription.name}: $${(subscription.monthlyCostCents / 100).toFixed(2)} per month, ${subscription.status}`}
    role="listitem"
  >
    <div className="analytics-subscription-card__info">
      <h4 className="analytics-subscription-card__name">{subscription.name}</h4>
      <p className="analytics-subscription-card__meta">
        {CADENCE_LABELS[subscription.cadence]} · {subscription.categoryName} ·{' '}
        {subscription.transactionCount} transactions
      </p>
    </div>
    <div className="analytics-subscription-card__cost">
      <span className="analytics-subscription-card__monthly">
        <CurrencyDisplay amount={subscription.monthlyCostCents} />
        <span aria-hidden="true">/mo</span>
      </span>
      <span className="analytics-subscription-card__annual">
        <CurrencyDisplay amount={subscription.annualCostCents} />
        <span aria-hidden="true">/yr</span>
      </span>
    </div>
    <div className="analytics-subscription-card__actions">
      <button
        className={`analytics-status-btn analytics-status-btn--${subscription.status}`}
        onClick={onToggleStatus}
        aria-label={`Change status of ${subscription.name}. Currently: ${subscription.status}`}
      >
        {STATUS_LABELS[subscription.status]}
      </button>
    </div>
  </article>
);

interface CategoryBreakdownProps {
  categories: SubscriptionCategoryGroup[];
}

const CategoryBreakdown: React.FC<CategoryBreakdownProps> = ({ categories }) => (
  <div className="analytics-breakdown" role="list" aria-label="Subscription categories">
    {categories.map((cat, idx) => {
      const color = CHART_COLORS[idx % CHART_COLORS.length];
      return (
        <div key={cat.categoryName} className="analytics-breakdown__item" role="listitem">
          <div className="analytics-breakdown__bar-wrapper">
            <div className="analytics-breakdown__header">
              <span className="analytics-breakdown__name">
                {cat.categoryName} ({cat.subscriptionCount})
              </span>
              <span className="analytics-breakdown__amount">
                <CurrencyDisplay amount={cat.monthlyCostCents} />
                <span aria-hidden="true">/mo</span>
              </span>
            </div>
            <div
              className="analytics-breakdown__track"
              role="progressbar"
              aria-valuenow={cat.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${cat.categoryName}: ${cat.percent}% of subscription spending`}
            >
              <div
                className="analytics-breakdown__fill"
                style={{ width: `${cat.percent}%`, backgroundColor: color }}
              />
            </div>
          </div>
          <span className="analytics-breakdown__percent">{cat.percent}%</span>
        </div>
      );
    })}
  </div>
);

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export const SubscriptionsPage: React.FC = () => {
  const { subscriptions, summary, loading, error, refresh, toggleStatus } = useSubscriptions();

  if (loading) {
    return (
      <div className="analytics-page__loading">
        <LoadingSpinner label="Analyzing subscriptions" />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={refresh} />;
  }

  if (subscriptions.length === 0) {
    return (
      <EmptyState
        title="No subscriptions detected"
        description="Recurring expense transactions will appear here once detected. Add more transactions over time to enable subscription tracking."
      />
    );
  }

  return (
    <div className="analytics-page">
      <div className="analytics-page__header">
        <h2 className="analytics-page__title">Subscriptions</h2>
      </div>

      {/* Summary metrics */}
      <section className="analytics-section" aria-label="Subscription summary" aria-live="polite">
        <div className="analytics-metrics-grid">
          <article className="analytics-metric-card" aria-label="Total monthly cost">
            <p className="analytics-metric-card__label">Monthly Cost</p>
            <p className="analytics-metric-card__value analytics-metric-card__value--negative">
              <CurrencyDisplay amount={summary.totalMonthlyCents} />
            </p>
          </article>
          <article className="analytics-metric-card" aria-label="Annual projection">
            <p className="analytics-metric-card__label">Annual Projection</p>
            <p className="analytics-metric-card__value analytics-metric-card__value--negative">
              <CurrencyDisplay amount={summary.totalAnnualCents} />
            </p>
          </article>
          <article className="analytics-metric-card" aria-label="Active subscriptions">
            <p className="analytics-metric-card__label">Active</p>
            <p className="analytics-metric-card__value">{summary.activeCount}</p>
          </article>
          <article className="analytics-metric-card" aria-label="Flagged subscriptions">
            <p className="analytics-metric-card__label">Flagged</p>
            <p className="analytics-metric-card__value">{summary.flaggedCount}</p>
          </article>
        </div>
      </section>

      {/* Category breakdown */}
      {summary.byCategory.length > 0 && (
        <section className="analytics-section" aria-label="Spending by category">
          <h3 className="analytics-section__title">By Category</h3>
          <CategoryBreakdown categories={summary.byCategory} />
        </section>
      )}

      {/* Subscription list */}
      <section className="analytics-section" aria-label="All subscriptions">
        <h3 className="analytics-section__title">All Subscriptions ({subscriptions.length})</h3>
        <div className="analytics-subscription-list" role="list">
          {subscriptions.map((sub) => (
            <SubscriptionCard
              key={sub.id}
              subscription={sub}
              onToggleStatus={() => toggleStatus(sub.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
};

export default SubscriptionsPage;
