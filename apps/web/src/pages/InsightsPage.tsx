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

import React, { useCallback, useMemo, useState } from 'react';
import { WeeklyDigest } from '../components/insights';
import { RecommendationsFeed } from '../components/recommendations';
import { WellnessOverview } from '../components/wellness';
import { CurrencyDisplay, EmptyState, ErrorBanner, LoadingSpinner } from '../components/common';
import { AppIcon, type IconName } from '../components/icons';
import { useInsights } from '../hooks/useInsights';
import { useRecommendations } from '../hooks/useRecommendations';
import { useWealthInsights } from '../hooks/useWealthInsights';
import { formatCurrency } from '../lib/currency';
import type {
  BudgetRuleOverview,
  FinancialHealthScore,
  InsightsData,
  MonthComparison,
  Recommendation,
  SpendingBenchmarkResult,
} from '../hooks/useInsights';
import type {
  AnnualSummary,
  CategoryDrillDown,
  SpendingTrendInsight,
} from '../lib/reports/reporting-beta';
import {
  buildInsightsPeerComparisonReport,
  buildPeerComparisonCards,
} from '../lib/reports/peer-insights-integration';
import './InsightsPage.css';

function isDigestEmpty(
  netWorth: number,
  spending: number,
  income: number,
  goalCount: number,
): boolean {
  return netWorth === 0 && spending === 0 && income === 0 && goalCount === 0;
}

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
  onDrillDown: () => void;
}

const CategoryBar: React.FC<CategoryBarProps> = ({ name, amount, percent, index, onDrillDown }) => {
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
      <div className="insights-category-bar__footer">
        <span className="insights-category-bar__percent">{percent}%</span>
        <button className="insights-link-button" type="button" onClick={onDrillDown}>
          Drill down
        </button>
      </div>
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
        {score.label}. {score.percent}% of benchmark categories are on track.
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

interface SpendingTrendCardProps {
  trend: SpendingTrendInsight;
}

const SpendingTrendCard: React.FC<SpendingTrendCardProps> = ({ trend }) => {
  const latest = trend.monthlyTotals.at(-1);
  return (
    <article
      className="insights-trend-card"
      role="listitem"
      aria-label={`${trend.periodMonths} month spending trend`}
    >
      <div className="insights-trend-card__header">
        <h4>{trend.periodMonths} months</h4>
        <span>{trend.insufficientData ? 'Insufficient history' : 'Trend ready'}</span>
      </div>
      {latest ? (
        <p>
          Latest month {latest.month}: <CurrencyDisplay amount={latest.total} />
        </p>
      ) : null}
      <p>{trend.pacing.summary}</p>
      {trend.seasonality.length > 0 ? (
        <ul>
          {trend.seasonality.slice(0, 2).map((signal) => (
            <li key={`${signal.categoryName}-${signal.monthName}`}>{signal.summary}</li>
          ))}
        </ul>
      ) : (
        <p>No recurring seasonal spikes detected yet.</p>
      )}
      {trend.actionableCopy.length > 0 ? (
        <p className="insights-trend-card__action">{trend.actionableCopy[0]}</p>
      ) : null}
    </article>
  );
};

interface CategoryDrillDownPanelProps {
  drillDown: CategoryDrillDown;
  onClose: () => void;
}

const CategoryDrillDownPanel: React.FC<CategoryDrillDownPanelProps> = ({ drillDown, onClose }) => (
  <section className="insights-drilldown" aria-label={`${drillDown.categoryName} drill-down`}>
    <div className="insights-drilldown__header">
      <h4>{drillDown.categoryName} drill-down</h4>
      <button className="insights-link-button" type="button" onClick={onClose}>
        Back to chart
      </button>
    </div>
    {drillDown.transactionCount === 0 ? (
      <p>No transactions match this category and the current filters.</p>
    ) : (
      <>
        <div className="insights-drilldown__stats" role="group" aria-label="Category totals">
          <span>Total: {formatCurrency(drillDown.total)}</span>
          <span>Transactions: {drillDown.transactionCount}</span>
          <span>Average: {formatCurrency(drillDown.averageTransaction)}</span>
          <span>
            Largest:{' '}
            {drillDown.largestTransaction
              ? `${drillDown.largestTransaction.payee} (${formatCurrency(drillDown.largestTransaction.amount)})`
              : 'None'}
          </span>
        </div>
        <div
          className="insights-drilldown__table-wrap"
          role="region"
          tabIndex={0}
          aria-label="Drill-down transactions"
        >
          <table className="insights-drilldown__table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Payee</th>
                <th>Account</th>
                <th>Amount</th>
                <th>Tags</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {drillDown.transactions.map((tx) => (
                <tr key={tx.id}>
                  <td>{tx.date}</td>
                  <td>{tx.payee}</td>
                  <td>{tx.accountName}</td>
                  <td>{formatCurrency(tx.amount)}</td>
                  <td>{tx.tags.join(', ') || '—'}</td>
                  <td>{tx.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )}
  </section>
);

interface YearInReviewCardProps {
  summary: AnnualSummary;
  privateMode: boolean;
}

const YearInReviewCard: React.FC<YearInReviewCardProps> = ({ summary, privateMode }) => {
  const money = (amount: number) => (privateMode ? '$•••' : formatCurrency(amount));
  return (
    <article className="insights-year-review" aria-label={`${summary.year} year in review summary`}>
      <p className="insights-section__note">
        Coverage: {summary.startDate} to {summary.endDate}
        {summary.isPartialYear ? ` (${summary.monthCount} months; partial-year data)` : ''}
      </p>
      <div className="insights-comparison">
        <div className="insights-comparison__item">
          <span>Total income</span>
          <strong>{money(summary.totalIncome)}</strong>
        </div>
        <div className="insights-comparison__item">
          <span>Total expenses</span>
          <strong>{money(summary.totalExpenses)}</strong>
        </div>
        <div className="insights-comparison__item">
          <span>Net cash flow</span>
          <strong>{money(summary.netCashFlow)}</strong>
        </div>
        <div className="insights-comparison__item">
          <span>Savings rate</span>
          <strong>{summary.savingsRate}%</strong>
        </div>
      </div>
      <h4>Top categories</h4>
      <ul>
        {summary.topCategories.map((category) => (
          <li key={category.categoryName}>
            {category.categoryName}: {money(category.amount)}
          </li>
        ))}
      </ul>
      <h4>Highlights and cautions</h4>
      <ul>
        {[...summary.highlights, ...summary.cautions].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
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

function isWellnessEmpty(wellness: ReturnType<typeof useWealthInsights>['wellness']): boolean {
  return (
    !wellness ||
    (wellness.anxietyScore.score === 0 &&
      wellness.moodCorrelation.entriesTagged === 0 &&
      wellness.stressIndicators.indicators.length === 0)
  );
}

export const InsightsPage: React.FC = () => {
  const {
    insights,
    loading: insightsLoading,
    error: insightsError,
    refresh: refreshInsights,
  } = useInsights();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null | undefined>(
    undefined,
  );
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [privateMode, setPrivateMode] = useState(false);
  const [peerProfileOptedIn, setPeerProfileOptedIn] = useState(false);

  const activeDrillDown = useMemo(
    () =>
      insights?.categoryDrillDowns.find(
        (drillDown) => drillDown.categoryId === selectedCategoryId,
      ) ?? null,
    [insights?.categoryDrillDowns, selectedCategoryId],
  );
  const activeAnnualSummary = useMemo(() => {
    if (!insights || insights.annualSummaries.length === 0) return null;
    return (
      insights.annualSummaries.find(
        (summary) => summary.year === (selectedYear ?? insights.annualSummaries[0]?.year),
      ) ?? insights.annualSummaries[0]
    );
  }, [insights, selectedYear]);
  const peerComparisonReport = useMemo(() => {
    if (!insights) return null;
    return buildInsightsPeerComparisonReport({
      profile: { optedIn: peerProfileOptedIn },
      categorySpending: insights.categorySpending,
      monthlyIncomeCents: insights.totalIncomeThisMonth,
    });
  }, [insights, peerProfileOptedIn]);
  const peerComparisonCards = useMemo(
    () => (peerComparisonReport ? buildPeerComparisonCards(peerComparisonReport) : []),
    [peerComparisonReport],
  );
  const {
    digest,
    wellness,
    activePeriod,
    setActivePeriod,
    loading: wealthLoading,
    error: wealthError,
    refresh: refreshWealth,
  } = useWealthInsights();
  const {
    recommendations,
    summary: recommendationSummary,
    loading: recommendationsLoading,
    error: recommendationsError,
    refresh: refreshRecommendations,
  } = useRecommendations(6);

  const loading = insightsLoading || wealthLoading;
  const error = insightsError ?? wealthError;
  const refresh = useCallback(() => {
    refreshInsights();
    refreshWealth();
  }, [refreshInsights, refreshWealth]);

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

  const insightsEmpty = insights === null || isInsightsEmpty(insights);
  const digestEmpty =
    !digest ||
    (isDigestEmpty(
      digest.netWorth.current,
      digest.spending.totalCurrentSpending,
      digest.savingsRate.currentIncome,
      digest.goals.length,
    ) &&
      isWellnessEmpty(wellness));

  if (insightsEmpty && digestEmpty) {
    return (
      <EmptyState
        title="No wealth insights yet"
        description="Add accounts, transactions, budgets, or goals to generate your personalized digest."
      />
    );
  }

  return (
    <div className="wealth-insights-page insights-page">
      {digest ? (
        <WeeklyDigest
          digest={digest}
          activePeriod={activePeriod}
          onPeriodChange={setActivePeriod}
        />
      ) : null}
      <RecommendationsFeed
        recommendations={recommendations}
        summary={recommendationSummary}
        loading={recommendationsLoading}
        error={recommendationsError}
        onRetry={refreshRecommendations}
      />
      {wellness ? <WellnessOverview overview={wellness} /> : null}
      {insights ? (
        <>
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
                    onDrillDown={() => setSelectedCategoryId(cat.categoryId)}
                  />
                ))}
              </div>
              {insights.categorySpending.length > 5 && (
                <p className="insights-section__note">
                  Showing top 5 of {insights.categorySpending.length} categories
                </p>
              )}
              {activeDrillDown ? (
                <CategoryDrillDownPanel
                  drillDown={activeDrillDown}
                  onClose={() => setSelectedCategoryId(undefined)}
                />
              ) : null}
            </section>
          )}

          {insights.spendingTrends.length > 0 && (
            <section className="insights-section" aria-label="Spending trends and seasonality">
              <h3 className="insights-section__title">Spending Trends & Seasonality</h3>
              <p className="insights-section__description">
                Review 6, 12, and 24 month spending windows, recurring seasonal spikes, and
                current-month pacing.
              </p>
              <div className="insights-trend-grid" role="list">
                {insights.spendingTrends.map((trend) => (
                  <SpendingTrendCard key={trend.periodMonths} trend={trend} />
                ))}
              </div>
            </section>
          )}

          {activeAnnualSummary ? (
            <section className="insights-section" aria-label="Year in review">
              <div className="insights-section__header-row">
                <h3 className="insights-section__title">Year in Review</h3>
                <div className="insights-section__controls">
                  <label>
                    Year{' '}
                    <select
                      value={activeAnnualSummary.year}
                      onChange={(event) => setSelectedYear(Number(event.target.value))}
                    >
                      {insights.annualSummaries.map((summary) => (
                        <option key={summary.year} value={summary.year}>
                          {summary.year}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={privateMode}
                      onChange={(event) => setPrivateMode(event.target.checked)}
                    />{' '}
                    Privacy mode
                  </label>
                </div>
              </div>
              <YearInReviewCard summary={activeAnnualSummary} privateMode={privateMode} />
              <div className="insights-export-actions">
                <a
                  className="insights-link-button"
                  href={`data:text/csv;charset=utf-8,${encodeURIComponent(
                    [
                      Object.keys(
                        activeAnnualSummary.csvRows[0] ?? { Metric: '', Amount: '' },
                      ).join(','),
                      ...activeAnnualSummary.csvRows.map((row) => Object.values(row).join(',')),
                    ].join('\n'),
                  )}`}
                  download={`year-in-review-${activeAnnualSummary.year}.csv`}
                >
                  Export CSV
                </a>
                <button className="insights-link-button" type="button">
                  PDF-ready summary
                </button>
              </div>
            </section>
          ) : null}

          <section className="insights-section" aria-label="How do I compare">
            <h3 className="insights-section__title">How Do I Compare?</h3>
            <p className="insights-section__description">
              Compare each category to student-friendly spending benchmarks and use the 50/30/20
              rule as a quick health check.
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
            <section className="insights-peer-comparisons" aria-label="Peer comparisons">
              <div className="insights-section__header-row">
                <div>
                  <h4>Peer comparisons</h4>
                  <p className="insights-section__description">
                    Optional category percentiles use local spending totals and only appear after
                    opt-in.
                  </p>
                </div>
                <div className="insights-section__controls">
                  {peerProfileOptedIn ? (
                    <>
                      <button
                        className="insights-link-button"
                        type="button"
                        onClick={() => setPeerProfileOptedIn(false)}
                      >
                        Clear peer profile
                      </button>
                      <button className="insights-link-button" type="button">
                        Edit cohort
                      </button>
                    </>
                  ) : (
                    <button
                      className="insights-link-button"
                      type="button"
                      onClick={() => setPeerProfileOptedIn(true)}
                    >
                      Opt in to peer comparisons
                    </button>
                  )}
                </div>
              </div>
              {peerProfileOptedIn && peerComparisonCards.length > 0 ? (
                <div
                  className="insights-benchmark-grid"
                  role="list"
                  aria-label="Category peer comparison cards"
                >
                  {peerComparisonCards.map((card) => (
                    <article
                      className={`insights-benchmark-card insights-benchmark-card--${card.status}`}
                      key={card.key}
                      role="listitem"
                      aria-label={card.ariaLabel}
                    >
                      <h5 className="insights-benchmark-card__title">{card.title}</h5>
                      <p className="insights-benchmark-card__badge">{card.percentLabel}</p>
                      <p>{card.rangeLabel}</p>
                      <p className="insights-benchmark-card__summary">{card.guidance}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="insights-section__note">
                  Current benchmark cards stay available without peer comparison opt-in.
                </p>
              )}
            </section>
          </section>

          {insights.dailySpending.length > 0 && (
            <section className="insights-section" aria-label="Daily spending trend">
              <h3 className="insights-section__title">Daily Spending Trend</h3>
              <div
                className="insights-daily-chart"
                role="img"
                aria-label="Daily spending bar chart"
              >
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
        </>
      ) : null}
    </div>
  );
};

export default InsightsPage;
