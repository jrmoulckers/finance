// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { Link, useParams } from 'react-router-dom';

import { CurrencyDisplay, ErrorBanner, LoadingSpinner } from '../components/common';
import { useGoals } from '../hooks';

function getGoalIcon(iconName: string | null | undefined): string {
  switch (iconName) {
    case 'shield':
      return '🛡️';
    case 'plane':
      return '✈️';
    case 'home':
      return '🏡';
    case 'laptop':
      return '💻';
    default:
      return '🎯';
  }
}

/** Detail view for a single goal route. */
export const GoalDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const { goals, loading, error, refresh } = useGoals();

  const goal = id ? (goals.find((g) => g.id === id) ?? null) : null;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-8) 0' }}>
        <LoadingSpinner label="Loading goal" />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={refresh} />;
  }

  if (goal === null) {
    return (
      <div>
        <Link
          to="/goals"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--spacing-1)',
            color: 'var(--semantic-text-secondary)',
            textDecoration: 'none',
          }}
          aria-label="Back to goals"
        >
          ← Back to Goals
        </Link>
        <p
          role="status"
          style={{ marginTop: 'var(--spacing-4)', color: 'var(--semantic-text-secondary)' }}
        >
          Goal not found.
        </p>
      </div>
    );
  }

  const percentComplete =
    goal.targetAmount.amount > 0
      ? Math.round((goal.currentAmount.amount / goal.targetAmount.amount) * 100)
      : 0;

  const statusTone =
    percentComplete >= 100
      ? 'positive'
      : percentComplete >= 50
        ? 'positive'
        : percentComplete >= 25
          ? 'warning'
          : 'negative';

  const remainingAmount = Math.max(goal.targetAmount.amount - goal.currentAmount.amount, 0);

  const targetDate = goal.targetDate ? new Date(`${goal.targetDate}T00:00:00`) : null;
  const daysLeft =
    targetDate === null
      ? null
      : Math.max(0, Math.ceil((targetDate.getTime() - Date.now()) / 86400000));

  const formattedTargetDate =
    targetDate !== null
      ? targetDate.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : null;

  return (
    <>
      <Link
        to="/goals"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--spacing-1)',
          color: 'var(--semantic-text-secondary)',
          textDecoration: 'none',
          marginBottom: 'var(--spacing-3)',
        }}
        aria-label="Back to goals"
      >
        ← Back to Goals
      </Link>

      <div style={{ marginBottom: 'var(--spacing-4)' }}>
        <h2
          style={{
            fontSize: 'var(--type-scale-headline-font-size)',
            fontWeight: 'var(--type-scale-headline-font-weight)',
            margin: 0,
          }}
        >
          <span aria-hidden="true">{getGoalIcon(goal.icon)}</span> {goal.name}
        </h2>
      </div>

      <article
        className="card"
        aria-label="Goal details"
        style={{ marginBottom: 'var(--spacing-6)' }}
      >
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-4)' }}>
          <div>
            <dt className="card__title">Target Amount</dt>
            <dd className="card__value">
              <CurrencyDisplay amount={goal.targetAmount.amount} currency={goal.currency.code} />
            </dd>
          </div>
          <div>
            <dt className="card__title">Current Amount</dt>
            <dd className="card__value">
              <CurrencyDisplay amount={goal.currentAmount.amount} currency={goal.currency.code} />
            </dd>
          </div>
          <div>
            <dt className="card__title">Status</dt>
            <dd>{goal.status.charAt(0) + goal.status.slice(1).toLowerCase()}</dd>
          </div>
          <div>
            <dt className="card__title">Target Date</dt>
            <dd>{formattedTargetDate ?? 'No target date'}</dd>
          </div>
          {daysLeft !== null && (
            <div>
              <dt className="card__title">Time Remaining</dt>
              <dd>
                {daysLeft > 0 ? `${daysLeft} days left` : daysLeft === 0 ? 'Due today' : 'Past due'}
              </dd>
            </div>
          )}
        </dl>
      </article>

      <section aria-label="Goal progress">
        <h3
          style={{
            fontWeight: 'var(--font-weight-semibold)',
            marginBottom: 'var(--spacing-3)',
          }}
        >
          Progress
        </h3>
        <div className="card" aria-label={`${goal.name}: ${percentComplete}% complete`}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 'var(--spacing-2)',
            }}
          >
            <CurrencyDisplay amount={goal.currentAmount.amount} currency={goal.currency.code} />
            <CurrencyDisplay amount={goal.targetAmount.amount} currency={goal.currency.code} />
          </div>
          <div
            className="progress-bar"
            role="progressbar"
            aria-valuenow={Math.min(percentComplete, 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${percentComplete}% of goal reached`}
          >
            <div
              className={`progress-bar__fill progress-bar__fill--${statusTone}`}
              style={{ width: `${Math.min(percentComplete, 100)}%` }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 'var(--spacing-2)',
              fontSize: 'var(--type-scale-caption-font-size)',
              color: 'var(--semantic-text-secondary)',
            }}
          >
            <span>
              {percentComplete >= 100 ? (
                'Goal reached! 🎉'
              ) : (
                <>
                  <CurrencyDisplay amount={remainingAmount} currency={goal.currency.code} /> to go (
                  {percentComplete}%)
                </>
              )}
            </span>
            <span>
              {daysLeft === null
                ? 'No due date'
                : daysLeft > 0
                  ? `${daysLeft} days left`
                  : 'Past due'}
            </span>
          </div>
        </div>
      </section>
    </>
  );
};

export default GoalDetailPage;
