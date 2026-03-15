// SPDX-License-Identifier: BUSL-1.1

import React, { useMemo } from 'react';
import { CategoryPieChart, SpendingBarChart, TrendLineChart } from '../components/charts';
import { CurrencyDisplay, EmptyState, ErrorBanner, LoadingSpinner } from '../components/common';
import { useCategories, useDashboardData, useTransactions } from '../hooks';
import type { DashboardData } from '../hooks/useDashboardData';
import type { Transaction } from '../kmp/bridge';

const CHART_LOOKBACK_DAYS = 30;

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

export const DashboardPage: React.FC = () => {
  const { data, loading, error, refresh } = useDashboardData();
  const {
    categories,
    loading: categoriesLoading,
    error: categoriesError,
    refresh: refreshCategories,
  } = useCategories();
  const chartDateRange = useMemo(() => getLastNDaysBounds(CHART_LOOKBACK_DAYS), []);
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

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const chartCurrency =
    chartTransactions[0]?.currency.code ?? data?.recentTransactions[0]?.currency.code ?? 'USD';
  const { trendData, barData, categoryData, hasChartData } = useMemo(() => {
    const transformedCategoryData = buildCategoryData(chartTransactions, categoryNames);

    return {
      trendData: buildTrendData(chartTransactions, CHART_LOOKBACK_DAYS),
      barData: transformedCategoryData.map(({ name, value }) => ({ name, amount: value })),
      categoryData: transformedCategoryData,
      hasChartData: transformedCategoryData.length > 0,
    };
  }, [chartTransactions, categoryNames]);

  const isLoading = loading || categoriesLoading || chartTransactionsLoading;
  const resolvedError = error ?? categoriesError ?? chartTransactionsError;
  const budgetPercentage =
    data !== null && data.monthlyBudget > 0
      ? Math.round((data.budgetSpent / data.monthlyBudget) * 100)
      : 0;
  const budgetStatusTone =
    budgetPercentage > 90 ? 'negative' : budgetPercentage > 75 ? 'warning' : 'positive';
  const handleRetry = () => {
    refresh();
    refreshCategories();
    refreshChartTransactions();
  };

  return (
    <>
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
                  <CurrencyDisplay amount={data.netWorth} colorize />
                </div>
              </article>
              <article className="card" aria-label="Monthly spending">
                <div className="card__header">
                  <h3 className="card__title">Spent This Month</h3>
                </div>
                <div className="card__value" aria-live="polite">
                  <CurrencyDisplay amount={data.spentThisMonth} />
                </div>
              </article>
              <article className="card" aria-label="Budget health">
                <div className="card__header">
                  <h3 className="card__title">Budget Health</h3>
                </div>
                <div className="card__value" aria-live="polite">
                  {budgetPercentage}% used
                </div>
                <div
                  className="progress-bar"
                  role="progressbar"
                  aria-valuenow={budgetPercentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Budget ${budgetPercentage}% used`}
                >
                  <div
                    className={`progress-bar__fill progress-bar__fill--${budgetStatusTone}`}
                    style={{ width: `${Math.min(budgetPercentage, 100)}%` }}
                  />
                </div>
              </article>
            </div>
          </section>
          {hasChartData ? (
            <section className="page-section dashboard-charts" aria-label="Financial charts">
              <div className="chart-container" aria-label="Spending trend chart">
                <TrendLineChart
                  data={trendData}
                  series={[{ dataKey: 'spending', name: 'Spending' }]}
                  currency={chartCurrency}
                  title="Spending Trend"
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
              {data.recentTransactions.length === 0 ? (
                <EmptyState
                  title="No recent transactions"
                  description="Transactions you add will appear here."
                />
              ) : (
                <ul className="list-group" role="list">
                  {data.recentTransactions.map((transaction) => (
                    <li key={transaction.id} className="list-item" role="listitem">
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
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
};

export default DashboardPage;
