// SPDX-License-Identifier: BUSL-1.1

/**
 * CashFlowPage — Cash flow analytics with income vs. expenses bar chart,
 * net income trend, income source breakdown, and summary stats.
 *
 * Accessibility:
 * - Section landmarks with aria-label
 * - Progress bars with ARIA roles
 * - Live region for loading/error states
 * - Keyboard-accessible period selector and export button
 *
 * References: issue #1587
 */

import React, { useState } from 'react';
import {
  CurrencyDisplay,
  EmptyState,
  ErrorBanner,
  ExplainThis,
  LoadingSpinner,
} from '../components/common';
import { useCashFlow } from '../hooks/useCashFlow';
import type { MonthlyAggregate, IncomeSource } from '../lib/analytics/cash-flow';
import { CHART_COLORS } from '../components/charts/chart-palette';
import './analytics.css';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type PeriodOption = 6 | 12 | 24;

interface PeriodSelectorProps {
  value: PeriodOption;
  onChange: (period: PeriodOption) => void;
}

const PERIOD_OPTIONS: PeriodOption[] = [6, 12, 24];

const PeriodSelector: React.FC<PeriodSelectorProps> = ({ value, onChange }) => (
  <div className="analytics-period-selector" role="tablist" aria-label="Time period">
    {PERIOD_OPTIONS.map((opt) => (
      <button
        key={opt}
        role="tab"
        aria-selected={value === opt}
        className={`analytics-period-selector__btn ${value === opt ? 'analytics-period-selector__btn--active' : ''}`}
        onClick={() => onChange(opt)}
      >
        {opt}M
      </button>
    ))}
  </div>
);

interface IncomeExpenseChartProps {
  aggregates: MonthlyAggregate[];
}

const IncomeExpenseChart: React.FC<IncomeExpenseChartProps> = ({ aggregates }) => {
  const maxValue = Math.max(...aggregates.flatMap((a) => [a.income, a.expenses]), 1);

  return (
    <div
      className="analytics-bar-chart"
      role="img"
      aria-label="Monthly income versus expenses bar chart"
    >
      {aggregates.map((agg) => (
        <div key={agg.month} className="analytics-bar-chart__group">
          <div className="analytics-bar-chart__bars">
            <div
              className="analytics-bar-chart__bar analytics-bar-chart__bar--income"
              style={{ height: `${Math.max((agg.income / maxValue) * 100, 1)}%` }}
              title={`Income: $${(agg.income / 100).toFixed(2)}`}
            />
            <div
              className="analytics-bar-chart__bar analytics-bar-chart__bar--expense"
              style={{ height: `${Math.max((agg.expenses / maxValue) * 100, 1)}%` }}
              title={`Expenses: $${(agg.expenses / 100).toFixed(2)}`}
            />
          </div>
          <span className="analytics-bar-chart__label">{agg.month.slice(5)}</span>
        </div>
      ))}
    </div>
  );
};

interface IncomeSourceListProps {
  sources: IncomeSource[];
}

const IncomeSourceList: React.FC<IncomeSourceListProps> = ({ sources }) => (
  <div className="analytics-breakdown" role="list" aria-label="Income sources">
    {sources.map((src, idx) => {
      const color = CHART_COLORS[idx % CHART_COLORS.length];
      return (
        <div
          key={src.categoryId ?? 'uncategorized'}
          className="analytics-breakdown__item"
          role="listitem"
        >
          <div className="analytics-breakdown__bar-wrapper">
            <div className="analytics-breakdown__header">
              <span className="analytics-breakdown__name">{src.categoryName}</span>
              <span className="analytics-breakdown__amount">
                <CurrencyDisplay amount={src.amount} />
              </span>
            </div>
            <div
              className="analytics-breakdown__track"
              role="progressbar"
              aria-valuenow={src.percentOfTotal}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${src.categoryName}: ${src.percentOfTotal}% of income`}
            >
              <div
                className="analytics-breakdown__fill"
                style={{ width: `${src.percentOfTotal}%`, backgroundColor: color }}
              />
            </div>
          </div>
          <span className="analytics-breakdown__percent">{src.percentOfTotal}%</span>
        </div>
      );
    })}
  </div>
);

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export const CashFlowPage: React.FC = () => {
  const [period, setPeriod] = useState<PeriodOption>(12);
  const { aggregates, summary, incomeSources, loading, error, refresh, exportCsv } =
    useCashFlow(period);

  if (loading) {
    return (
      <div className="analytics-page__loading">
        <LoadingSpinner label="Loading cash flow data" />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={refresh} />;
  }

  const isEmpty =
    summary.monthCount === 0 || (summary.totalIncome === 0 && summary.totalExpenses === 0);

  if (isEmpty) {
    return (
      <EmptyState
        title="No cash flow data"
        description="Start adding income and expense transactions to see your cash flow trends over time."
      />
    );
  }

  return (
    <div className="analytics-page">
      <div className="analytics-page__header">
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--spacing-2)',
          }}
        >
          <h2 className="analytics-page__title" style={{ margin: 0 }}>
            Cash Flow
          </h2>
          <ExplainThis glossaryKey="cashFlow" buttonLabel="Explain cash flow" />
        </div>
        <div className="analytics-page__actions">
          <PeriodSelector value={period} onChange={setPeriod} />
          <button
            className="analytics-export-btn"
            onClick={exportCsv}
            aria-label="Export cash flow data as CSV"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary metrics */}
      <section className="analytics-section" aria-label="Cash flow summary">
        <div className="analytics-metrics-grid">
          <article className="analytics-metric-card" aria-label="Average monthly income">
            <p className="analytics-metric-card__label">Avg. Monthly Income</p>
            <p className="analytics-metric-card__value analytics-metric-card__value--positive">
              <CurrencyDisplay amount={summary.averageMonthlyIncome} />
            </p>
          </article>
          <article className="analytics-metric-card" aria-label="Average monthly expenses">
            <p className="analytics-metric-card__label">Avg. Monthly Expenses</p>
            <p className="analytics-metric-card__value analytics-metric-card__value--negative">
              <CurrencyDisplay amount={summary.averageMonthlyExpenses} />
            </p>
          </article>
          <article className="analytics-metric-card" aria-label="Average net income">
            <p className="analytics-metric-card__label">Avg. Net Income</p>
            <p
              className={`analytics-metric-card__value ${
                summary.averageMonthlyNetIncome >= 0
                  ? 'analytics-metric-card__value--positive'
                  : 'analytics-metric-card__value--negative'
              }`}
            >
              <CurrencyDisplay amount={summary.averageMonthlyNetIncome} />
            </p>
          </article>
          <article className="analytics-metric-card" aria-label="Total net income">
            <p className="analytics-metric-card__label">Total Net ({summary.monthCount}mo)</p>
            <p
              className={`analytics-metric-card__value ${
                summary.totalNetIncome >= 0
                  ? 'analytics-metric-card__value--positive'
                  : 'analytics-metric-card__value--negative'
              }`}
            >
              <CurrencyDisplay amount={summary.totalNetIncome} />
            </p>
          </article>
        </div>
      </section>

      {/* Income vs Expenses chart */}
      <section className="analytics-section" aria-label="Income vs expenses chart">
        <h3 className="analytics-section__title">Income vs. Expenses</h3>
        <IncomeExpenseChart aggregates={aggregates} />
        <div style={{ display: 'flex', gap: 'var(--spacing-4)', marginTop: 'var(--spacing-2)' }}>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-1)',
              fontSize: 'var(--type-scale-caption-font-size)',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 12,
                height: 12,
                borderRadius: 2,
                background: 'var(--semantic-status-positive)',
                display: 'inline-block',
              }}
            />
            Income
          </span>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-1)',
              fontSize: 'var(--type-scale-caption-font-size)',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 12,
                height: 12,
                borderRadius: 2,
                background: 'var(--semantic-status-negative)',
                display: 'inline-block',
              }}
            />
            Expenses
          </span>
        </div>
      </section>

      {/* Income sources breakdown */}
      {incomeSources.length > 0 && (
        <section className="analytics-section" aria-label="Income sources">
          <h3 className="analytics-section__title">Income Sources</h3>
          <IncomeSourceList sources={incomeSources} />
        </section>
      )}
    </div>
  );
};

export default CashFlowPage;
