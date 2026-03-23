// SPDX-License-Identifier: BUSL-1.1

import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';

import { CurrencyDisplay, ErrorBanner, LoadingSpinner } from '../components/common';
import { useBudgets, useCategories } from '../hooks';

const PERIOD_LABELS: Record<string, string> = {
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Bi-weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  YEARLY: 'Yearly',
};

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

/** Detail view for a single budget route. */
export const BudgetDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const { budgets, loading, error, refresh } = useBudgets();
  const { categories, loading: categoriesLoading } = useCategories();

  const isLoading = loading || categoriesLoading;

  const budget = id ? (budgets.find((b) => b.id === id) ?? null) : null;

  const category = useMemo(
    () => (budget ? (categories.find((c) => c.id === budget.categoryId) ?? null) : null),
    [budget, categories],
  );

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-8) 0' }}>
        <LoadingSpinner label="Loading budget" />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={refresh} />;
  }

  if (budget === null) {
    return (
      <div>
        <Link
          to="/budgets"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--spacing-1)',
            color: 'var(--semantic-text-secondary)',
            textDecoration: 'none',
          }}
          aria-label="Back to budgets"
        >
          ← Back to Budgets
        </Link>
        <p
          role="status"
          style={{ marginTop: 'var(--spacing-4)', color: 'var(--semantic-text-secondary)' }}
        >
          Budget not found.
        </p>
      </div>
    );
  }

  const percentUsed =
    budget.amount.amount > 0
      ? Math.round((budget.spentAmount.amount / budget.amount.amount) * 100)
      : 0;
  const statusTone = percentUsed > 90 ? 'negative' : percentUsed > 75 ? 'warning' : 'positive';
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percentUsed, 100) / 100) * circumference;

  return (
    <>
      <Link
        to="/budgets"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--spacing-1)',
          color: 'var(--semantic-text-secondary)',
          textDecoration: 'none',
          marginBottom: 'var(--spacing-3)',
        }}
        aria-label="Back to budgets"
      >
        ← Back to Budgets
      </Link>

      <div style={{ marginBottom: 'var(--spacing-4)' }}>
        <h2
          style={{
            fontSize: 'var(--type-scale-headline-font-size)',
            fontWeight: 'var(--type-scale-headline-font-weight)',
            margin: 0,
          }}
        >
          <span aria-hidden="true">{getBudgetIcon(category?.icon)}</span> {budget.name}
        </h2>
      </div>

      <article
        className="card"
        aria-label="Budget details"
        style={{ marginBottom: 'var(--spacing-6)' }}
      >
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-4)' }}>
          <div>
            <dt className="card__title">Category</dt>
            <dd>{category?.name ?? 'Uncategorized'}</dd>
          </div>
          <div>
            <dt className="card__title">Period</dt>
            <dd>{PERIOD_LABELS[budget.period] ?? budget.period}</dd>
          </div>
          <div>
            <dt className="card__title">Budget Amount</dt>
            <dd className="card__value">
              <CurrencyDisplay amount={budget.amount.amount} currency={budget.currency.code} />
            </dd>
          </div>
          <div>
            <dt className="card__title">Start Date</dt>
            <dd>{budget.startDate}</dd>
          </div>
          {budget.endDate !== null && (
            <div>
              <dt className="card__title">End Date</dt>
              <dd>{budget.endDate}</dd>
            </div>
          )}
          {budget.isRollover && (
            <div>
              <dt className="card__title">Rollover</dt>
              <dd>Yes</dd>
            </div>
          )}
        </dl>
      </article>

      <section aria-label="Spending progress">
        <h3
          style={{
            fontWeight: 'var(--font-weight-semibold)',
            marginBottom: 'var(--spacing-3)',
          }}
        >
          Spending Progress
        </h3>
        <div
          className="card"
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-4)' }}
          aria-label={`${budget.name}: ${percentUsed}% used`}
        >
          <div
            className="progress-ring"
            role="progressbar"
            aria-valuenow={Math.min(percentUsed, 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${percentUsed}% of budget used`}
          >
            <svg
              className="progress-ring__svg"
              width="88"
              height="88"
              viewBox="0 0 88 88"
              aria-hidden="true"
            >
              <circle className="progress-ring__track" cx="44" cy="44" r={radius} strokeWidth="8" />
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
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 'var(--spacing-2)',
              }}
            >
              <div>
                <p className="card__title">Spent</p>
                <p className="card__value">
                  <CurrencyDisplay
                    amount={budget.spentAmount.amount}
                    currency={budget.currency.code}
                  />
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p className="card__title">Remaining</p>
                <p className="card__value">
                  <CurrencyDisplay
                    amount={budget.remainingAmount.amount}
                    currency={budget.currency.code}
                    colorize
                  />
                </p>
              </div>
            </div>
            <p
              style={{
                fontSize: 'var(--type-scale-caption-font-size)',
                color:
                  budget.remainingAmount.amount >= 0
                    ? 'var(--semantic-status-positive)'
                    : 'var(--semantic-status-negative)',
              }}
            >
              {budget.remainingAmount.amount >= 0 ? (
                <>
                  <CurrencyDisplay
                    amount={budget.remainingAmount.amount}
                    currency={budget.currency.code}
                  />{' '}
                  left
                </>
              ) : (
                <>
                  <CurrencyDisplay
                    amount={Math.abs(budget.remainingAmount.amount)}
                    currency={budget.currency.code}
                  />{' '}
                  over budget
                </>
              )}
            </p>
          </div>
        </div>
      </section>
    </>
  );
};

export default BudgetDetailPage;
