// SPDX-License-Identifier: BUSL-1.1

import React, { useMemo } from 'react';
import { CurrencyDisplay, EmptyState, ErrorBanner, LoadingSpinner } from '../components/common';
import { useCategories, useDashboardData } from '../hooks';
import type { DashboardData } from '../hooks/useDashboardData';
import type { Transaction } from '../kmp/bridge';

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

export const DashboardPage: React.FC = () => {
  const { data, loading, error, refresh } = useDashboardData();
  const {
    categories,
    loading: categoriesLoading,
    error: categoriesError,
    refresh: refreshCategories,
  } = useCategories();

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const isLoading = loading || categoriesLoading;
  const resolvedError = error ?? categoriesError;
  const budgetPercentage =
    data !== null && data.monthlyBudget > 0
      ? Math.round((data.budgetSpent / data.monthlyBudget) * 100)
      : 0;
  const budgetStatusTone =
    budgetPercentage > 90 ? 'negative' : budgetPercentage > 75 ? 'warning' : 'positive';
  const handleRetry = () => {
    refresh();
    refreshCategories();
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
