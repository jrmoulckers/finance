// SPDX-License-Identifier: BUSL-1.1

/**
 * Financial Insights page — deeper analytics beyond the basic dashboard.
 *
 * Sections:
 * 1. Summary cards (average daily spend, savings rate, total transactions, net)
 * 2. Income vs Expenses trend (TrendLineChart)
 * 3. Spending by category (CategoryPieChart + table)
 * 4. Top payees/merchants (table)
 *
 * Fully accessible: ARIA landmarks, keyboard-navigable period selector,
 * semantic tables with captions and scoped headers.
 *
 * References: issue #241
 */

import React, { useCallback, useMemo } from 'react';
import { TrendLineChart } from '../components/charts';
import { CategoryPieChart } from '../components/charts';
import { CurrencyDisplay, EmptyState, ErrorBanner, LoadingSpinner } from '../components/common';
import { useInsights } from '../hooks/useInsights';
import type { CategoryBreakdown } from '../hooks/useInsights';
import '../styles/insights.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PERIOD_OPTIONS = [3, 6, 12] as const;

const PERIOD_LABELS: Record<number, string> = {
  3: '3 months',
  6: '6 months',
  12: '12 months',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(_cents: number, _currency = 'USD', _locale = 'en-US'): string {
  const major = cents / 100;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(major);
}

function savingsRateColorClass(rate: number): string {
  if (rate > 20) return 'insights-summary-card__value--positive';
  if (rate >= 10) return 'insights-summary-card__value--warning';
  return 'insights-summary-card__value--negative';
}

function trendArrow(trend: CategoryBreakdown['trend']): string {
  switch (trend) {
    case 'up':
      return '↑';
    case 'down':
      return '↓';
    case 'stable':
      return '→';
  }
}

function trendLabel(trend: CategoryBreakdown['trend']): string {
  switch (trend) {
    case 'up':
      return 'Spending increased';
    case 'down':
      return 'Spending decreased';
    case 'stable':
      return 'Spending stable';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const InsightsPage: React.FC = () => {
  const {
    monthlyBreakdown,
    categoryBreakdown,
    topPayees,
    averageDailySpend,
    savingsRate,
    loading,
    error,
    selectedPeriod,
    setSelectedPeriod,
  } = useInsights();

  const handlePeriodChange = useCallback(
    (months: number) => {
      setSelectedPeriod(months);
    },
    [setSelectedPeriod],
  );

  // Period selector keyboard handling (left/right arrow within radiogroup)
  const handlePeriodKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIndex = PERIOD_OPTIONS.indexOf(
        selectedPeriod as (typeof PERIOD_OPTIONS)[number],
      );
      let nextIndex: number;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        nextIndex = (currentIndex + 1) % PERIOD_OPTIONS.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        nextIndex = (currentIndex - 1 + PERIOD_OPTIONS.length) % PERIOD_OPTIONS.length;
      } else {
        return;
      }

      e.preventDefault();
      setSelectedPeriod(PERIOD_OPTIONS[nextIndex]);
      // Focus the newly selected button
      const container = e.currentTarget;
      const buttons = container.querySelectorAll<HTMLButtonElement>('button');
      buttons[nextIndex]?.focus();
    },
    [selectedPeriod, setSelectedPeriod],
  );

  // Derived chart data
  const trendChartData = useMemo(
    () =>
      monthlyBreakdown.map((m) => ({
        label: m.month,
        income: m.income / 100,
        expenses: m.expenses / 100,
        net: m.net / 100,
      })),
    [monthlyBreakdown],
  );

  const trendSeries = useMemo(
    () => [
      { dataKey: 'income', name: 'Income' },
      { dataKey: 'expenses', name: 'Expenses' },
      { dataKey: 'net', name: 'Net' },
    ],
    [],
  );

  const pieData = useMemo(
    () =>
      categoryBreakdown.map((c) => ({
        name: c.categoryName,
        value: c.total / 100,
      })),
    [categoryBreakdown],
  );

  const totalTransactions = useMemo(
    () => monthlyBreakdown.reduce((sum, m) => sum + m.transactionCount, 0),
    [monthlyBreakdown],
  );

  const netChange = useMemo(
    () => monthlyBreakdown.reduce((sum, m) => sum + m.net, 0),
    [monthlyBreakdown],
  );

  const hasData =
    monthlyBreakdown.length > 0 && monthlyBreakdown.some((m) => m.transactionCount > 0);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      {/* Header with period selector */}
      <div className="insights-header">
        <h2 className="insights-header__title">Financial Insights</h2>

        <div
          className="insights-period-selector"
          role="radiogroup"
          aria-label="Analysis period"
          onKeyDown={handlePeriodKeyDown}
        >
          {PERIOD_OPTIONS.map((months) => {
            const isSelected = selectedPeriod === months;
            return (
              <button
                key={months}
                type="button"
                className="insights-period-selector__option"
                role="radio"
                aria-checked={isSelected}
                aria-pressed={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => handlePeriodChange(months)}
              >
                {PERIOD_LABELS[months]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: 'var(--spacing-8) 0',
          }}
        >
          <LoadingSpinner label="Loading insights" />
        </div>
      ) : error ? (
        <ErrorBanner message={error} />
      ) : !hasData ? (
        <EmptyState
          title="No insights yet"
          description="Add transactions to see your financial analytics and spending patterns here."
        />
      ) : (
        <>
          {/* Section 1: Summary Cards */}
          <section className="insights-section" aria-label="Financial summary">
            <div className="insights-summary-grid">
              <article className="insights-summary-card" aria-label="Average daily spending">
                <span className="insights-summary-card__label">Avg. Daily Spending</span>
                <span className="insights-summary-card__value">
                  <CurrencyDisplay amount={averageDailySpend} />
                </span>
              </article>

              <article className="insights-summary-card" aria-label="Savings rate">
                <span className="insights-summary-card__label">Savings Rate</span>
                <span
                  className={`insights-summary-card__value ${savingsRateColorClass(savingsRate)}`}
                >
                  {savingsRate}%
                </span>
              </article>

              <article className="insights-summary-card" aria-label="Total transactions">
                <span className="insights-summary-card__label">Total Transactions</span>
                <span className="insights-summary-card__value">
                  {totalTransactions.toLocaleString()}
                </span>
              </article>

              <article className="insights-summary-card" aria-label="Net change over period">
                <span className="insights-summary-card__label">Net Change</span>
                <span className="insights-summary-card__value">
                  <CurrencyDisplay amount={netChange} colorize showSign />
                </span>
              </article>
            </div>
          </section>

          {/* Section 2: Income vs Expenses Trend */}
          <section className="insights-section" aria-label="Income versus expenses trend">
            <h3 className="insights-section__title">Income vs Expenses</h3>
            <div className="insights-chart-container">
              <TrendLineChart
                data={trendChartData}
                series={trendSeries}
                title="Income vs Expenses Over Time"
              />
            </div>
          </section>

          {/* Section 3: Spending by Category */}
          <section className="insights-section" aria-label="Spending by category">
            <h3 className="insights-section__title">Spending by Category</h3>

            {categoryBreakdown.length > 0 ? (
              <>
                <div className="insights-chart-container">
                  <CategoryPieChart
                    data={pieData}
                    width={320}
                    height={320}
                    title="Category Breakdown"
                  />
                </div>

                <table className="insights-table" aria-label="Category spending breakdown">
                  <caption>
                    Spending by category for the last {PERIOD_LABELS[selectedPeriod]}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Category</th>
                      <th scope="col" className="text-right">
                        Amount
                      </th>
                      <th scope="col" className="text-right">
                        Share
                      </th>
                      <th scope="col" className="text-right">
                        Transactions
                      </th>
                      <th scope="col">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryBreakdown.map((cat) => (
                      <tr key={cat.categoryId ?? '__uncategorized'}>
                        <td>{cat.categoryName}</td>
                        <td className="text-right">
                          <CurrencyDisplay amount={cat.total} />
                        </td>
                        <td className="text-right">{cat.percentage.toFixed(1)}%</td>
                        <td className="text-right">{cat.transactionCount}</td>
                        <td>
                          <span
                            className={`insights-trend insights-trend--${cat.trend}`}
                            aria-label={trendLabel(cat.trend)}
                          >
                            <span className="insights-trend__arrow" aria-hidden="true">
                              {trendArrow(cat.trend)}
                            </span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <EmptyState
                title="No category data"
                description="Categorize your transactions to see spending breakdowns."
              />
            )}
          </section>

          {/* Section 4: Top Payees / Merchants */}
          <section className="insights-section" aria-label="Top payees">
            <h3 className="insights-section__title">Top Payees</h3>

            {topPayees.length > 0 ? (
              <table className="insights-table" aria-label="Top payees by spending">
                <caption>Top 10 payees for the last {PERIOD_LABELS[selectedPeriod]}</caption>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Payee</th>
                    <th scope="col" className="text-right">
                      Total Spent
                    </th>
                    <th scope="col" className="text-right">
                      Transactions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topPayees.map((payee, index) => (
                    <tr key={payee.name}>
                      <td>{index + 1}</td>
                      <td>{payee.name}</td>
                      <td className="text-right">
                        <CurrencyDisplay amount={payee.total} />
                      </td>
                      <td className="text-right">{payee.transactionCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState
                title="No payee data"
                description="Add transactions with payee names to see your top merchants."
              />
            )}
          </section>
        </>
      )}
    </>
  );
};

export default InsightsPage;
