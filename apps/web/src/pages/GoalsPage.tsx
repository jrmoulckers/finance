// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { CurrencyDisplay, EmptyState, ErrorBanner, LoadingSpinner } from '../components/common';
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

export const GoalsPage: React.FC = () => {
  const { goals, loading, error, refresh } = useGoals();
  const totalTarget = goals.reduce((sum, goal) => sum + goal.targetAmount.amount, 0);
  const totalSaved = goals.reduce((sum, goal) => sum + goal.currentAmount.amount, 0);

  return (
    <>
      <h2
        style={{
          fontSize: 'var(--type-scale-headline-font-size)',
          fontWeight: 'var(--type-scale-headline-font-weight)',
          marginBottom: 'var(--spacing-6)',
        }}
      >
        Goals
      </h2>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-8) 0' }}>
          <LoadingSpinner label="Loading goals" />
        </div>
      ) : error ? (
        <ErrorBanner message={error} onRetry={refresh} />
      ) : goals.length === 0 ? (
        <EmptyState
          title="No goals yet"
          description="Create a savings goal to track progress toward something important."
        />
      ) : (
        <>
          <section className="page-section" aria-label="Goals summary">
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
                  <p className="card__title">Goals</p>
                  <p className="card__value">{goals.length}</p>
                </div>
                <div>
                  <p className="card__title">Saved</p>
                  <p className="card__value">
                    <CurrencyDisplay amount={totalSaved} />
                  </p>
                </div>
                <div>
                  <p className="card__title">Target</p>
                  <p className="card__value">
                    <CurrencyDisplay amount={totalTarget} />
                  </p>
                </div>
              </div>
            </div>
          </section>
          <section aria-label="Goal list">
            <div className="card-grid">
              {goals.map((goal) => {
                const percentComplete =
                  goal.targetAmount.amount > 0
                    ? Math.round((goal.currentAmount.amount / goal.targetAmount.amount) * 100)
                    : 0;
                const remainingAmount = Math.max(
                  goal.targetAmount.amount - goal.currentAmount.amount,
                  0,
                );
                const statusTone =
                  percentComplete >= 100
                    ? 'positive'
                    : percentComplete >= 50
                      ? 'positive'
                      : percentComplete >= 25
                        ? 'warning'
                        : 'negative';
                const targetDate = goal.targetDate ? new Date(`${goal.targetDate}T00:00:00`) : null;
                const daysLeft =
                  targetDate === null
                    ? null
                    : Math.max(0, Math.ceil((targetDate.getTime() - Date.now()) / 86400000));

                return (
                  <article
                    key={goal.id}
                    className="card"
                    aria-label={`${goal.name}: ${percentComplete}%`}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 'var(--spacing-3)',
                      }}
                    >
                      <h3 style={{ fontWeight: 'var(--font-weight-semibold)' }}>
                        <span aria-hidden="true">{getGoalIcon(goal.icon)}</span> {goal.name}
                      </h3>
                      <span
                        style={{
                          fontSize: 'var(--type-scale-caption-font-size)',
                          color: 'var(--semantic-text-secondary)',
                        }}
                      >
                        {targetDate !== null
                          ? targetDate.toLocaleDateString('en-US', {
                              month: 'short',
                              year: 'numeric',
                            })
                          : 'No target date'}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 'var(--spacing-2)',
                      }}
                    >
                      <CurrencyDisplay
                        amount={goal.currentAmount.amount}
                        currency={goal.currency.code}
                      />
                      <CurrencyDisplay
                        amount={goal.targetAmount.amount}
                        currency={goal.currency.code}
                      />
                    </div>
                    <div
                      className="progress-bar"
                      role="progressbar"
                      aria-valuenow={Math.min(percentComplete, 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
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
                          'Goal reached!'
                        ) : (
                          <>
                            <CurrencyDisplay
                              amount={remainingAmount}
                              currency={goal.currency.code}
                            />{' '}
                            to go
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

export default GoalsPage;
