// SPDX-License-Identifier: BUSL-1.1

import React, { useMemo } from 'react';
import { CurrencyDisplay, EmptyState, ErrorBanner, LoadingSpinner } from '../components/common';
import { useBudgets, useCategories } from '../hooks';

function getBudgetIcon(iconName: string | null | undefined): string {
  switch (iconName) {
    case 'utensils':
      return '🛒';
    case 'home':
      return '🏠';
    case 'car':
      return '🚗';
    case 'film':
      return '🎬';
    case 'wallet':
      return '💰';
    default:
      return '📊';
  }
}

export const BudgetsPage: React.FC = () => {
  const { budgets, loading, error, refresh } = useBudgets();
  const {
    categories,
    loading: categoriesLoading,
    error: categoriesError,
    refresh: refreshCategories,
  } = useCategories();

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const isLoading = loading || categoriesLoading;
  const resolvedError = error ?? categoriesError;
  const handleRetry = () => {
    refresh();
    refreshCategories();
  };

  const totalBudgeted = budgets.reduce((sum, budget) => sum + budget.amount.amount, 0);
  const totalSpent = budgets.reduce((sum, budget) => sum + budget.spentAmount.amount, 0);
  const totalRemaining = budgets.reduce((sum, budget) => sum + budget.remainingAmount.amount, 0);

  return (
    <>
      <h2
        style={{
          fontSize: 'var(--type-scale-headline-font-size)',
          fontWeight: 'var(--type-scale-headline-font-weight)',
          marginBottom: 'var(--spacing-6)',
        }}
      >
        Budgets
      </h2>
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-8) 0' }}>
          <LoadingSpinner label="Loading budgets" />
        </div>
      ) : resolvedError ? (
        <ErrorBanner message={resolvedError} onRetry={handleRetry} />
      ) : budgets.length === 0 ? (
        <EmptyState
          title="No budgets yet"
          description="Create your first budget to start tracking spending by category."
        />
      ) : (
        <>
          <section className="page-section" aria-label="Budget summary">
            <div className="card" style={{ marginBottom: 'var(--spacing-6)' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 'var(--spacing-4)',
                }}
              >
                <div>
                  <p className="card__title">Budgeted</p>
                  <p className="card__value">
                    <CurrencyDisplay amount={totalBudgeted} />
                  </p>
                </div>
                <div>
                  <p className="card__title">Spent</p>
                  <p className="card__value">
                    <CurrencyDisplay amount={totalSpent} />
                  </p>
                </div>
                <div>
                  <p className="card__title">Remaining</p>
                  <p className="card__value">
                    <CurrencyDisplay amount={totalRemaining} colorize />
                  </p>
                </div>
              </div>
            </div>
          </section>
          <section aria-label="Budget categories">
            <div className="card-grid card-grid--2">
              {budgets.map((budget) => {
                const percentUsed =
                  budget.amount.amount > 0
                    ? Math.round((budget.spentAmount.amount / budget.amount.amount) * 100)
                    : 0;
                const remainingAmount = budget.remainingAmount.amount;
                const statusTone =
                  percentUsed > 90 ? 'negative' : percentUsed > 75 ? 'warning' : 'positive';
                const radius = 36;
                const circumference = 2 * Math.PI * radius;
                const offset = circumference - (Math.min(percentUsed, 100) / 100) * circumference;
                const category = categoriesById.get(budget.categoryId);

                return (
                  <article
                    key={budget.id}
                    className="card"
                    aria-label={`${budget.name}: ${percentUsed}% used`}
                    style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-4)' }}
                  >
                    <div
                      className="progress-ring"
                      role="progressbar"
                      aria-valuenow={Math.min(percentUsed, 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <svg
                        className="progress-ring__svg"
                        width="88"
                        height="88"
                        viewBox="0 0 88 88"
                        aria-hidden="true"
                      >
                        <circle
                          className="progress-ring__track"
                          cx="44"
                          cy="44"
                          r={radius}
                          strokeWidth="8"
                        />
                        <circle
                          className={`progress-ring__fill progress-ring__fill--${statusTone}`}
                          cx="44"
                          cy="44"
                          r={radius}
                          strokeWidth="8"
                          strokeDasharray={circumference}
                          strokeDashoffset={offset}
                        />
                      </svg>
                      <span className="progress-ring__label" aria-hidden="true">
                        {percentUsed}%
                      </span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 'var(--font-weight-semibold)' }}>
                        <span aria-hidden="true">{getBudgetIcon(category?.icon)}</span>{' '}
                        {budget.name}
                      </p>
                      <p
                        style={{
                          fontSize: 'var(--type-scale-caption-font-size)',
                          color: 'var(--semantic-text-secondary)',
                        }}
                      >
                        <CurrencyDisplay
                          amount={budget.spentAmount.amount}
                          currency={budget.currency.code}
                        />{' '}
                        of{' '}
                        <CurrencyDisplay
                          amount={budget.amount.amount}
                          currency={budget.currency.code}
                        />
                      </p>
                      <p
                        style={{
                          fontSize: 'var(--type-scale-caption-font-size)',
                          color:
                            remainingAmount >= 0
                              ? 'var(--semantic-status-positive)'
                              : 'var(--semantic-status-negative)',
                        }}
                      >
                        {remainingAmount >= 0 ? (
                          <>
                            <CurrencyDisplay
                              amount={remainingAmount}
                              currency={budget.currency.code}
                            />{' '}
                            left
                          </>
                        ) : (
                          <>
                            <CurrencyDisplay
                              amount={Math.abs(remainingAmount)}
                              currency={budget.currency.code}
                            />{' '}
                            over
                          </>
                        )}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </>
  );
};

export default BudgetsPage;
