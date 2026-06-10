// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CategoryPieChart,
  SpendingBarChart,
  SpendingTrendChart,
  type TimePeriod,
  type ViewType,
} from '../components/charts';
import { CoachCard, CoachPanel } from '../components/coaching';
import { CurrencyDisplay, EmptyState, ErrorBanner, LoadingSpinner } from '../components/common';
import { QueryEngine } from '../components/ai/QueryEngine';
import { OfflineBanner } from '../components/OfflineBanner';
import { useCategories, useCoachAlerts, useDashboardData, useTransactions } from '../hooks';
import type { DashboardData } from '../hooks/useDashboardData';
import type { Transaction } from '../kmp/bridge';
import { getBudgetStatusIndicator } from '../lib/a11y';
import { rollUpProtectedTransactions } from '../lib/ui/privacy';

const PERIOD_DAYS: Record<Exclude<TimePeriod, 'custom'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
};

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getLastNDaysBounds(days: number): { startDate: string; endDate: string } {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - (days - 1));

  return {
    startDate: formatLocalDate(startDate),
    endDate: formatLocalDate(endDate),
  };
}

function getTransactionDisplayAmount(transaction: Transaction): number {
  if (transaction.type === 'EXPENSE') {
    return -Math.abs(transaction.amount.amount);
  }

  return transaction.amount.amount;
}

function isDashboardDataEmpty(data: DashboardData): boolean {
  return (
    data.netWorth === 0 &&
    data.spentThisMonth === 0 &&
    data.incomeThisMonth === 0 &&
    data.monthlyBudget === 0 &&
    data.budgetSpent === 0 &&
    data.recentTransactions.length === 0 &&
    data.accountSummary.length === 0
  );
}

function buildTrendData(transactions: Transaction[], days: number) {
  const dailySpending = new Map<string, number>();

  for (const transaction of transactions) {
    dailySpending.set(
      transaction.date,
      (dailySpending.get(transaction.date) ?? 0) + Math.abs(transaction.amount.amount) / 100,
    );
  }

  const endDate = new Date();

  return Array.from({ length: days }, (_value, index) => {
    const pointDate = new Date(endDate);
    pointDate.setDate(endDate.getDate() - (days - index - 1));
    const dateKey = formatLocalDate(pointDate);

    return {
      label: pointDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      spending: dailySpending.get(dateKey) ?? 0,
    };
  });
}

function buildCategoryData(transactions: Transaction[], categoryNames: Map<string, string>) {
  const totalsByCategory = new Map<string, number>();

  for (const transaction of transactions) {
    const categoryName =
      transaction.categoryId !== null
        ? (categoryNames.get(transaction.categoryId) ?? 'Uncategorized')
        : 'Uncategorized';

    totalsByCategory.set(
      categoryName,
      (totalsByCategory.get(categoryName) ?? 0) + Math.abs(transaction.amount.amount) / 100,
    );
  }

  return Array.from(totalsByCategory, ([name, value]) => ({ name, value })).sort(
    (left, right) => right.value - left.value,
  );
}

/**
 * Compute average daily spending and period-over-period comparison.
 */
function computeSpendingStats(
  currentTransactions: Transaction[],
  days: number,
): { averageDaily: number; totalSpending: number } {
  const totalSpending = currentTransactions.reduce(
    (sum, t) => sum + Math.abs(t.amount.amount) / 100,
    0,
  );
  const averageDaily = days > 0 ? totalSpending / days : 0;
  return { averageDaily, totalSpending };
}

export const DashboardPage: React.FC = () => {
  const { data, loading, error, refresh } = useDashboardData();
  const {
    categories,
    loading: categoriesLoading,
    error: categoriesError,
    refresh: refreshCategories,
  } = useCategories();
  const {
    analysis: coachAnalysis,
    topAlerts,
    loading: coachLoading,
    dismissAlert,
  } = useCoachAlerts();

  // Spending trend chart state
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('30d');
  const [viewType, setViewType] = useState<ViewType>('line');

  const activeDays = PERIOD_DAYS[selectedPeriod === 'custom' ? '30d' : selectedPeriod];

  const chartDateRange = useMemo(() => getLastNDaysBounds(activeDays), [activeDays]);
  const chartFilters = useMemo(
    () => ({
      type: 'EXPENSE' as const,
      startDate: chartDateRange.startDate,
      endDate: chartDateRange.endDate,
    }),
    [chartDateRange],
  );
  const {
    transactions: chartTransactions,
    loading: chartTransactionsLoading,
    error: chartTransactionsError,
    refresh: refreshChartTransactions,
  } = useTransactions(chartFilters);

  // Previous period transactions for comparison
  const prevDateRange = useMemo(() => {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - activeDays);
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (activeDays - 1));
    return {
      startDate: formatLocalDate(startDate),
      endDate: formatLocalDate(endDate),
    };
  }, [activeDays]);

  const prevFilters = useMemo(
    () => ({
      type: 'EXPENSE' as const,
      startDate: prevDateRange.startDate,
      endDate: prevDateRange.endDate,
    }),
    [prevDateRange],
  );
  const { transactions: prevTransactions } = useTransactions(prevFilters);

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const chartCurrency =
    chartTransactions[0]?.currency.code ?? data?.recentTransactions[0]?.currency.code ?? 'USD';

  const chartPrivacyRollup = useMemo(
    () => rollUpProtectedTransactions(chartTransactions, categories),
    [chartTransactions, categories],
  );

  const recentPrivacyRollup = useMemo(
    () => (data === null ? null : rollUpProtectedTransactions(data.recentTransactions, categories)),
    [data, categories],
  );

  const { trendData, barData, categoryData, hasChartData } = useMemo(() => {
    const transformedCategoryData = buildCategoryData(
      chartPrivacyRollup.visibleTransactions,
      categoryNames,
    );

    if (chartPrivacyRollup.protectedRollup !== null) {
      transformedCategoryData.push({
        name: `${chartPrivacyRollup.protectedRollup.label} (${chartPrivacyRollup.protectedRollup.count})`,
        value: chartPrivacyRollup.protectedRollup.totalCents / 100,
      });
    }

    return {
      trendData: buildTrendData(chartPrivacyRollup.visibleTransactions, activeDays),
      barData: transformedCategoryData.map(({ name, value }) => ({ name, amount: value })),
      categoryData: transformedCategoryData,
      hasChartData: transformedCategoryData.length > 0,
    };
  }, [chartPrivacyRollup, categoryNames, activeDays]);

  const { averageDaily, totalSpending } = useMemo(
    () => computeSpendingStats(chartPrivacyRollup.visibleTransactions, activeDays),
    [chartPrivacyRollup, activeDays],
  );

  const prevPrivacyRollup = useMemo(
    () => rollUpProtectedTransactions(prevTransactions, categories),
    [prevTransactions, categories],
  );

  const comparison = useMemo(() => {
    if (prevPrivacyRollup.visibleTransactions.length === 0 && totalSpending === 0) return null;
    const prevTotal = prevPrivacyRollup.visibleTransactions.reduce(
      (sum, t) => sum + Math.abs(t.amount.amount) / 100,
      0,
    );
    if (prevTotal === 0) return null;
    const percentChange = ((totalSpending - prevTotal) / prevTotal) * 100;
    return {
      percentChange,
      absoluteChange: totalSpending - prevTotal,
    };
  }, [prevPrivacyRollup, totalSpending]);

  const handlePeriodChange = useCallback((period: TimePeriod) => {
    setSelectedPeriod(period);
  }, []);

  const handleViewTypeChange = useCallback((type: ViewType) => {
    setViewType(type);
  }, []);

  const isLoading = loading || categoriesLoading || chartTransactionsLoading;
  const resolvedError = error ?? categoriesError ?? chartTransactionsError;
  const budgetPercentage =
    data !== null && data.monthlyBudget > 0
      ? Math.round((data.budgetSpent / data.monthlyBudget) * 100)
      : 0;
  const budgetStatusTone =
    budgetPercentage > 90 ? 'negative' : budgetPercentage > 75 ? 'warning' : 'positive';
  const dashboardBudgetStatus = getBudgetStatusIndicator(budgetPercentage);
  const handleRetry = () => {
    refresh();
    refreshCategories();
    refreshChartTransactions();
  };

  return (
    <>
      <OfflineBanner />
      <h2
        style={{
          fontSize: 'var(--type-scale-headline-font-size)',
          fontWeight: 'var(--type-scale-headline-font-weight)',
          marginBottom: 'var(--spacing-6)',
        }}
      >
        Dashboard
      </h2>
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-8) 0' }}>
          <LoadingSpinner label="Loading dashboard" />
        </div>
      ) : resolvedError ? (
        <ErrorBanner message={resolvedError} onRetry={handleRetry} />
      ) : data === null || isDashboardDataEmpty(data) ? (
        <EmptyState
          title="No dashboard data yet"
          description="Add accounts, budgets, or transactions to see your financial summary here."
        />
      ) : (
        <>
          <section className="page-section" aria-label="Financial summary">
            <div className="card-grid card-grid--3">
              <article className="card" aria-label="Net worth">
                <div className="card__header">
                  <h3 className="card__title">Net Worth</h3>
                </div>
                <div className="card__value" aria-live="polite">
                  <CurrencyDisplay amount={data.netWorth} colorize context="net worth" />
                </div>
              </article>
              <article className="card" aria-label="Monthly spending">
                <div className="card__header">
                  <h3 className="card__title">Spent This Month</h3>
                </div>
                <div className="card__value" aria-live="polite">
                  <CurrencyDisplay amount={data.spentThisMonth} context="spent this month" />
                </div>
              </article>
              <article className="card" aria-label="Budget health">
                <div className="card__header">
                  <h3 className="card__title">Budget Health</h3>
                </div>
                <div className="card__value" aria-live="polite">
                  <span aria-hidden="true">{dashboardBudgetStatus.icon} </span>
                  {budgetPercentage}% used
                  <span className="sr-only">, {dashboardBudgetStatus.label}</span>
                </div>
                <div
                  className="progress-bar"
                  role="progressbar"
                  aria-valuenow={budgetPercentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Budget ${budgetPercentage} percent used, ${dashboardBudgetStatus.label}`}
                >
                  <div
                    className={`progress-bar__fill progress-bar__fill--${budgetStatusTone}`}
                    style={{ width: `${Math.min(budgetPercentage, 100)}%` }}
                  />
                </div>
              </article>
            </div>
          </section>
          <section className="page-section" aria-label="Financial coach">
            <CoachCard alerts={topAlerts} loading={coachLoading} onDismiss={dismissAlert} />
          </section>
          <section className="page-section" aria-label="Coach insights">
            <CoachPanel analysis={coachAnalysis} loading={coachLoading} />
          </section>
          {hasChartData ? (
            <section className="page-section dashboard-charts" aria-label="Financial charts">
              <div className="chart-container" aria-label="Spending trend chart">
                <SpendingTrendChart
                  data={trendData}
                  currency={chartCurrency}
                  title="Spending Trend"
                  selectedPeriod={selectedPeriod}
                  onPeriodChange={handlePeriodChange}
                  viewType={viewType}
                  onViewTypeChange={handleViewTypeChange}
                  averageDailySpending={averageDaily}
                  comparison={comparison}
                />
              </div>
              <div className="chart-container" aria-label="Category spending bar chart">
                <SpendingBarChart
                  data={barData}
                  currency={chartCurrency}
                  title="Spending by Category"
                />
              </div>
              <div className="chart-container" aria-label="Category share pie chart">
                <CategoryPieChart
                  data={categoryData}
                  currency={chartCurrency}
                  width={280}
                  height={280}
                  title="Category Share"
                />
              </div>
            </section>
          ) : null}
          <section className="page-section" aria-label="Recent transactions">
            <h3 className="page-section__title">Recent Transactions</h3>
            <div className="card">
              {(recentPrivacyRollup?.visibleTransactions.length ?? 0) === 0 &&
              recentPrivacyRollup?.protectedRollup === null ? (
                <EmptyState
                  title="No recent transactions"
                  description="Transactions you add will appear here."
                />
              ) : (
                <ul className="list-group" role="list">
                  {recentPrivacyRollup?.protectedRollup !== null &&
                    recentPrivacyRollup?.protectedRollup !== undefined && (
                      <li className="list-item" role="listitem">
                        <div className="list-item__content">
                          <p className="list-item__primary">Protected</p>
                          <p className="list-item__secondary">
                            {recentPrivacyRollup.protectedRollup.count} protected transaction
                            {recentPrivacyRollup.protectedRollup.count === 1 ? '' : 's'} hidden
                          </p>
                        </div>
                        <div className="list-item__trailing">
                          <CurrencyDisplay
                            amount={recentPrivacyRollup.protectedRollup.totalCents}
                            currency={recentPrivacyRollup.protectedRollup.currency}
                            context="protected transactions total"
                          />
                        </div>
                      </li>
                    )}
                  {recentPrivacyRollup?.visibleTransactions.map((transaction) => (
                    <li key={transaction.id} className="list-item" role="listitem">
                      <Link
                        to={`/transactions/${transaction.id}`}
                        className="list-item__link"
                        aria-label={`View transaction: ${transaction.payee ?? transaction.note ?? 'Transaction'}`}
                      >
                        <div className="list-item__content">
                          <p className="list-item__primary">
                            {transaction.payee ??
                              transaction.note ??
                              (transaction.type === 'TRANSFER' ? 'Transfer' : 'Transaction')}
                          </p>
                          <p className="list-item__secondary">
                            {transaction.categoryId !== null
                              ? (categoryNames.get(transaction.categoryId) ?? 'Uncategorized')
                              : 'Uncategorized'}
                          </p>
                        </div>
                        <div className="list-item__trailing">
                          <CurrencyDisplay
                            amount={getTransactionDisplayAmount(transaction)}
                            currency={transaction.currency.code}
                            colorize
                            showSign
                          />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      )}
      <QueryEngine />
    </>
  );
};

export default DashboardPage;
