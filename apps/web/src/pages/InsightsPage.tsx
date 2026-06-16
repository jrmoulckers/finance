// SPDX-License-Identifier: BUSL-1.1

/**
 * InsightsPage — Financial insights dashboard with spending trends,
 * category analysis, and actionable recommendations.
 *
 * Accessibility:
 * - Section landmarks with aria-label
 * - Progress bars with proper ARIA roles
 * - Live region for loading/error states
 * - Keyboard-accessible interactive elements
 */

import React from 'react';
import { CurrencyDisplay, EmptyState, ErrorBanner, LoadingSpinner } from '../components/common';
import { useInsights } from '../hooks/useInsights';
import { formatCurrency } from '../lib/currency';
import type {
  BudgetRuleOverview,
  FinancialHealthScore,
  InsightsData,
  MonthComparison,
  Recommendation,
  SpendingBenchmarkResult,
} from '../hooks/useInsights';
import './InsightsPage.css';
import { AppIcon, type IconName } from '../components/icons';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  comparison?: MonthComparison;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, comparison }) => (
  <article className="insights-metric-card" aria-label={label}>
    <p className="insights-metric-card__label">{label}</p>
    <p className="insights-metric-card__value">{value}</p>
    {comparison && (
      <p
        className={`insights-metric-card__change insights-metric-card__change--${comparison.direction}`}
        aria-label={`${comparison.direction === 'up' ? 'Increased' : comparison.direction === 'down' ? 'Decreased' : 'No change'} by ${Math.abs(comparison.changePercent)}% from last month`}
      >
        <span aria-hidden="true">
          {comparison.direction === 'up' ? '↑' : comparison.direction === 'down' ? '↓' : '→'}
        </span>{' '}
        {Math.abs(comparison.changePercent)}% vs last month
      </p>
    )}
  </article>
);

interface CategoryBarProps {
  name: string;
  amount: number;
  percent: number;
  index: number;
}

const CategoryBar: React.FC<CategoryBarProps> = ({ name, amount, percent, index }) => {
  const colors = [
    'var(--semantic-status-info)',
    'var(--semantic-status-positive)',
    'var(--semantic-status-warning)',
    'var(--semantic-status-negative)',
    'var(--semantic-interactive-default)',
  ];
  const color = colors[index % colors.length];

  return (
    <div className="insights-category-bar" role="listitem">
      <div className="insights-category-bar__header">
        <span className="insights-category-bar__name">{name}</span>
        <span className="insights-category-bar__amount">
          <CurrencyDisplay amount={amount} />
        </span>
      </div>
      <div
        className="insights-category-bar__track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${name}: ${percent}% of spending`}
      >
        <div
          className="insights-category-bar__fill"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
      </div>
      <span className="insights-category-bar__percent">{percent}%</span>
    </div>
  );
};

interface RecommendationCardProps {
  recommendation: Recommendation;
}

const RecommendationCard: React.FC<RecommendationCardProps> = ({ recommendation }) => {
  const icon: IconName =
    recommendation.severity === 'success'
      ? 'check'
      : recommendation.severity === 'warning'
        ? 'alert-triangle'
        : 'info';

  return (
    <article
      className={`insights-recommendation insights-recommendation--${recommendation.severity}`}
      aria-label={recommendation.title}
      role="listitem"
    >
      <span className="insights-recommendation__icon" aria-hidden="true">
        <AppIcon name={icon} />
      </span>
      <div className="insights-recommendation__content">
        <h3 className="insights-recommendation__title">{recommendation.title}</h3>
        <p className="insights-recommendation__description">{recommendation.description}</p>
      </div>
    </article>
  );
};

interface FinancialHealthScoreCardProps {
  score: FinancialHealthScore;
}

const FinancialHealthScoreCard: React.FC<FinancialHealthScoreCardProps> = ({ score }) => (
  <article
    className="insights-overview-card insights-health-score"
    aria-label="Financial Health Score"
  >
    <div className="insights-overview-card__icon" aria-hidden="true">
      <AppIcon name="medal" />
    </div>
    <div>
      <p className="insights-overview-card__eyebrow">Financial Health Score</p>
      <p className="insights-health-score__value">{score.score}/8</p>
      <p className="insights-health-score__summary">
        {score.label} — {score.percent}% of benchmark categories are on track.
      </p>
    </div>
  </article>
);

interface BudgetRuleCardProps {
  overview: BudgetRuleOverview;
}

const BudgetRuleCard: React.FC<BudgetRuleCardProps> = ({ overview }) => (
  <article className="insights-overview-card insights-budget-rule" aria-label="50/30/20 rule">
    <div className="insights-overview-card__icon" aria-hidden="true">
      <AppIcon name="target" />
    </div>
    <div className="insights-budget-rule__content">
      <p className="insights-overview-card__eyebrow">50/30/20 Rule</p>
      <p className="insights-budget-rule__summary">{overview.summary}</p>
      <div className="insights-budget-rule__buckets" role="list" aria-label="50/30/20 breakdown">
        {overview.buckets.map((bucket) => (
          <div
            key={bucket.key}
            className={`insights-budget-rule__bucket insights-budget-rule__bucket--${bucket.status}`}
            role="listitem"
          >
            <span className="insights-budget-rule__bucket-label">{bucket.label}</span>
            <span className="insights-budget-rule__bucket-value">
              {bucket.actualPercent}% / {bucket.targetPercent}%
            </span>
          </div>
        ))}
      </div>
    </div>
  </article>
);

interface BenchmarkCardProps {
  benchmark: SpendingBenchmarkResult;
}

const BenchmarkCard: React.FC<BenchmarkCardProps> = ({ benchmark }) => {
  const clampedPercent = Math.max(0, Math.min(benchmark.userPercent, 100));
  const benchmarkStyle = {
    '--benchmark-start': `${benchmark.minPercent}%`,
    '--benchmark-width': `${Math.max(benchmark.maxPercent - benchmark.minPercent, 2)}%`,
    '--benchmark-fill': `${clampedPercent}%`,
    ...(benchmark.recommendedPercent
      ? { '--benchmark-target': `${Math.min(benchmark.recommendedPercent, 100)}%` }
      : {}),
  } as React.CSSProperties;

  return (
    <article
      className={`insights-benchmark-card insights-benchmark-card--${benchmark.status}`}
      role="listitem"
      aria-label={`${benchmark.label} benchmark`}
    >
      <div className="insights-benchmark-card__header">
        <div>
          <h4 className="insights-benchmark-card__title">{benchmark.label}</h4>
          <p className="insights-benchmark-card__amount">
            <CurrencyDisplay amount={benchmark.amount} />
          </p>
        </div>
        <span
          className={`insights-benchmark-card__badge insights-benchmark-card__badge--${benchmark.status}`}
        >
          {benchmark.userPercent}%
        </span>
      </div>

      <div
        className="insights-benchmark-card__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clampedPercent}
        aria-valuetext={`${benchmark.userPercent}% of income. Recommended ${benchmark.benchmarkLabel}.`}
        aria-label={`${benchmark.label} comparison`}
        style={benchmarkStyle}
      >
        <div className="insights-benchmark-card__zone" />
        {benchmark.recommendedPercent ? <div className="insights-benchmark-card__target" /> : null}
        <div className="insights-benchmark-card__fill" />
      </div>

      <div className="insights-benchmark-card__meta">
        <span>Recommended {benchmark.benchmarkLabel}</span>
        {benchmark.recommendedPercent ? <span>Target {benchmark.recommendedPercent}%</span> : null}
      </div>
      <p className="insights-benchmark-card__summary">{benchmark.summary}</p>
    </article>
  );
};

function isInsightsEmpty(data: InsightsData): boolean {
  return (
    data.totalSpentThisMonth === 0 &&
    data.totalIncomeThisMonth === 0 &&
    data.categorySpending.length === 0 &&
    data.dailySpending.length === 0
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export const InsightsPage: React.FC = () => {
  const { insights, loading, error, refresh } = useInsights();

  if (loading) {
    return (
      <div className="insights-page__loading">
        <LoadingSpinner label="Loading insights" />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={refresh} />;
  }

  if (!insights || isInsightsEmpty(insights)) {
    return (
      <EmptyState
        title="No insights yet"
        description="Start adding transactions to see spending trends, category analysis, and personalized recommendations."
      />
    );
  }

  return (
    <div className="insights-page">
      <div className="page-section__header">
        <h2 className="insights-page__title">Financial Insights</h2>
      </div>

      <section className="insights-section" aria-label="Key metrics">
        <div className="insights-metrics-grid">
          <MetricCard
            label="Spent This Month"
            value={<CurrencyDisplay amount={insights.totalSpentThisMonth} />}
            comparison={insights.spendingComparison}
          />
          <MetricCard
            label="Income This Month"
            value={<CurrencyDisplay amount={insights.totalIncomeThisMonth} />}
            comparison={insights.incomeComparison}
          />
          <MetricCard
            label="Net Cash Flow"
            value={<CurrencyDisplay amount={insights.netCashFlow} />}
          />
          <MetricCard
            label="Savings Rate"
            value={
              <span aria-label={`Savings rate: ${insights.savingsRate} percent`}>
                {insights.savingsRate}%
              </span>
            }
          />
          <MetricCard
            label="Avg. Daily Spending"
            value={<CurrencyDisplay amount={insights.averageDailySpending} />}
          />
        </div>
      </section>

      {insights.topCategories.length > 0 && (
        <section className="insights-section" aria-label="Spending by category">
          <h3 className="insights-section__title">Top Spending Categories</h3>
          <div className="insights-categories" role="list">
            {insights.topCategories.map((cat, idx) => (
              <CategoryBar
                key={cat.categoryId ?? 'uncategorized'}
                name={cat.categoryName}
                amount={cat.amount}
                percent={cat.percentOfTotal}
                index={idx}
              />
            ))}
          </div>
          {insights.categorySpending.length > 5 && (
            <p className="insights-section__note">
              Showing top 5 of {insights.categorySpending.length} categories
            </p>
          )}
        </section>
      )}

      <section className="insights-section" aria-label="How do I compare">
        <h3 className="insights-section__title">How Do I Compare?</h3>
        <p className="insights-section__description">
          Compare each category to student-friendly spending benchmarks and use the 50/30/20 rule as
          a quick health check.
        </p>
        <div className="insights-benchmark-overview">
          <FinancialHealthScoreCard score={insights.financialHealthScore} />
          <BudgetRuleCard overview={insights.budgetRuleOverview} />
        </div>
        <div className="insights-benchmark-grid" role="list">
          {insights.spendingBenchmarks.map((benchmark) => (
            <BenchmarkCard key={benchmark.key} benchmark={benchmark} />
          ))}
        </div>
      </section>

      {insights.dailySpending.length > 0 && (
        <section className="insights-section" aria-label="Daily spending trend">
          <h3 className="insights-section__title">Daily Spending Trend</h3>
          <div className="insights-daily-chart" role="img" aria-label="Daily spending bar chart">
            {insights.dailySpending.map((day) => {
              const maxAmount = Math.max(...insights.dailySpending.map((d) => d.amount));
              const heightPercent = maxAmount > 0 ? (day.amount / maxAmount) * 100 : 0;
              return (
                <div
                  key={day.date}
                  className="insights-daily-chart__bar-wrapper"
                  title={`${day.date}: ${formatCurrency(day.amount)}`}
                >
                  <div
                    className="insights-daily-chart__bar"
                    style={{ height: `${Math.max(heightPercent, 2)}%` }}
                  />
                  <span className="insights-daily-chart__label">
                    {new Date(`${day.date}T00:00:00`).getDate()}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="insights-section" aria-label="Month comparison">
        <h3 className="insights-section__title">Month-Over-Month</h3>
        <div className="insights-comparison">
          <div className="insights-comparison__item">
            <span className="insights-comparison__label">Last Month Spending</span>
            <span className="insights-comparison__value">
              <CurrencyDisplay amount={insights.totalSpentLastMonth} />
            </span>
          </div>
          <div className="insights-comparison__item">
            <span className="insights-comparison__label">This Month Spending</span>
            <span className="insights-comparison__value">
              <CurrencyDisplay amount={insights.totalSpentThisMonth} />
            </span>
          </div>
          <div className="insights-comparison__item">
            <span className="insights-comparison__label">Last Month Income</span>
            <span className="insights-comparison__value">
              <CurrencyDisplay amount={insights.totalIncomeLastMonth} />
            </span>
          </div>
          <div className="insights-comparison__item">
            <span className="insights-comparison__label">This Month Income</span>
            <span className="insights-comparison__value">
              <CurrencyDisplay amount={insights.totalIncomeThisMonth} />
            </span>
          </div>
        </div>
      </section>

      {insights.recommendations.length > 0 && (
        <section className="insights-section" aria-label="Recommendations">
          <h3 className="insights-section__title">Recommendations</h3>
          <div className="insights-recommendations" role="list">
            {insights.recommendations.map((rec) => (
              <RecommendationCard key={rec.id} recommendation={rec} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default InsightsPage;
