// SPDX-License-Identifier: BUSL-1.1

/**
 * NetWorthPage — Net worth timeline with asset class breakdown,
 * milestone markers, and period comparison.
 *
 * Accessibility:
 * - Section landmarks with aria-label
 * - Progress bars with ARIA roles
 * - Milestones with clear reached/pending status
 * - Keyboard-accessible interactive elements
 *
 * References: issue #1578
 */

import React from 'react';
import { CurrencyDisplay, EmptyState, ErrorBanner, LoadingSpinner } from '../components/common';
import { useNetWorth } from '../hooks/useNetWorth';
import type { AssetClassBreakdown, NetWorthMilestone } from '../lib/analytics/net-worth';
import { CHART_COLORS } from '../components/charts/chart-palette';
import './analytics.css';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface AssetClassListProps {
  classes: AssetClassBreakdown[];
}

const AssetClassList: React.FC<AssetClassListProps> = ({ classes }) => (
  <div className="analytics-breakdown" role="list" aria-label="Asset class breakdown">
    {classes.map((cls, idx) => {
      const color = CHART_COLORS[idx % CHART_COLORS.length];
      return (
        <div key={cls.className} className="analytics-breakdown__item" role="listitem">
          <div className="analytics-breakdown__bar-wrapper">
            <div className="analytics-breakdown__header">
              <span className="analytics-breakdown__name">
                {cls.className} ({cls.accountCount})
              </span>
              <span className="analytics-breakdown__amount">
                <CurrencyDisplay amount={cls.balance} />
              </span>
            </div>
            <div
              className="analytics-breakdown__track"
              role="progressbar"
              aria-valuenow={cls.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${cls.className}: ${cls.percent}% of total`}
            >
              <div
                className="analytics-breakdown__fill"
                style={{ width: `${cls.percent}%`, backgroundColor: color }}
              />
            </div>
          </div>
          <span className="analytics-breakdown__percent">{cls.percent}%</span>
        </div>
      );
    })}
  </div>
);

interface MilestoneListProps {
  milestones: NetWorthMilestone[];
}

const MilestoneList: React.FC<MilestoneListProps> = ({ milestones }) => (
  <div className="analytics-milestones" role="list" aria-label="Net worth milestones">
    {milestones.map((ms) => (
      <div
        key={ms.id}
        className={`analytics-milestone ${ms.reached ? 'analytics-milestone--reached' : 'analytics-milestone--pending'}`}
        role="listitem"
        aria-label={`${ms.label}: ${ms.reached ? 'reached' : 'not yet reached'}`}
      >
        <span className="analytics-milestone__icon" aria-hidden="true">
          {ms.reached ? '✅' : '⬜'}
        </span>
        <span className="analytics-milestone__label">{ms.label}</span>
      </div>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export const NetWorthPage: React.FC = () => {
  const { currentNetWorth, assetClasses, milestones, loading, error, refresh } = useNetWorth();

  if (loading) {
    return (
      <div className="analytics-page__loading">
        <LoadingSpinner label="Loading net worth data" />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={refresh} />;
  }

  if (!currentNetWorth) {
    return (
      <EmptyState
        title="No accounts found"
        description="Add bank accounts, credit cards, or investment accounts to see your net worth breakdown."
      />
    );
  }

  const isEmpty = currentNetWorth.assets === 0 && currentNetWorth.liabilities === 0;

  if (isEmpty) {
    return (
      <EmptyState
        title="No net worth data"
        description="Your accounts have no balances yet. Update account balances to see your net worth."
      />
    );
  }

  return (
    <div className="analytics-page">
      <div className="analytics-page__header">
        <h2 className="analytics-page__title">Net Worth</h2>
      </div>

      {/* Key figures */}
      <section className="analytics-section" aria-label="Net worth summary">
        <div className="analytics-metrics-grid">
          <article className="analytics-metric-card" aria-label="Net worth">
            <p className="analytics-metric-card__label">Net Worth</p>
            <p
              className={`analytics-metric-card__value ${
                currentNetWorth.netWorth >= 0
                  ? 'analytics-metric-card__value--positive'
                  : 'analytics-metric-card__value--negative'
              }`}
            >
              <CurrencyDisplay amount={currentNetWorth.netWorth} />
            </p>
          </article>
          <article className="analytics-metric-card" aria-label="Total assets">
            <p className="analytics-metric-card__label">Total Assets</p>
            <p className="analytics-metric-card__value analytics-metric-card__value--positive">
              <CurrencyDisplay amount={currentNetWorth.assets} />
            </p>
          </article>
          <article className="analytics-metric-card" aria-label="Total liabilities">
            <p className="analytics-metric-card__label">Total Liabilities</p>
            <p className="analytics-metric-card__value analytics-metric-card__value--negative">
              <CurrencyDisplay amount={currentNetWorth.liabilities} />
            </p>
          </article>
        </div>
      </section>

      {/* Asset class breakdown */}
      {assetClasses.length > 0 && (
        <section className="analytics-section" aria-label="Asset classes">
          <h3 className="analytics-section__title">Asset Class Breakdown</h3>
          <AssetClassList classes={assetClasses} />
        </section>
      )}

      {/* Milestones */}
      {milestones.length > 0 && (
        <section className="analytics-section" aria-label="Milestones">
          <h3 className="analytics-section__title">Milestones</h3>
          <MilestoneList milestones={milestones} />
        </section>
      )}
    </div>
  );
};

export default NetWorthPage;
