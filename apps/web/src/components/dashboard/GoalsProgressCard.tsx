// SPDX-License-Identifier: BUSL-1.1

import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { CurrencyDisplay } from '../common';
import type { Goal } from '../../kmp/bridge';

export interface GoalsProgressCardProps {
  /** Goals (already purpose-filtered). */
  readonly goals: readonly Goal[];
  /** Fallback ISO 4217 currency code when a goal has none. */
  readonly currency?: string;
  /** Maximum number of goals to show inline before linking out. */
  readonly maxVisible?: number;
}

interface GoalProgress {
  readonly id: string;
  readonly name: string;
  readonly currentCents: number;
  readonly targetCents: number;
  readonly percent: number;
  readonly currency: string;
  readonly isComplete: boolean;
}

function toGoalProgress(goal: Goal, fallbackCurrency: string): GoalProgress {
  const targetCents = Math.max(0, goal.targetAmount.amount);
  const currentCents = Math.max(0, goal.currentAmount.amount);
  const percent =
    targetCents > 0 ? Math.min(100, Math.round((currentCents / targetCents) * 100)) : 0;

  return {
    id: goal.id,
    name: goal.name,
    currentCents,
    targetCents,
    percent,
    currency: goal.currency.code ?? fallbackCurrency,
    isComplete: targetCents > 0 && currentCents >= targetCents,
  };
}

/**
 * Surfaces progress toward active savings goals directly on the home screen,
 * with a labelled progress bar and percent-complete per goal.
 *
 * Progress is conveyed with text (the percent and the amounts) alongside the
 * bar, and the bar exposes `role="progressbar"` with `aria-valuenow`, so the
 * meaning never depends on the visual fill alone (WCAG 2.2 AA).
 */
export const GoalsProgressCard: React.FC<GoalsProgressCardProps> = ({
  goals,
  currency = 'USD',
  maxVisible = 3,
}) => {
  const activeGoals = useMemo(
    () =>
      goals
        .filter((goal) => goal.status === 'ACTIVE')
        .map((goal) => toGoalProgress(goal, currency))
        .sort((left, right) => right.percent - left.percent),
    [goals, currency],
  );

  const visibleGoals = activeGoals.slice(0, maxVisible);
  const remaining = activeGoals.length - visibleGoals.length;

  return (
    <article className="card goals-progress-card" aria-label="Savings goals progress">
      <div className="card__header">
        <h3 className="card__title">Goals Progress</h3>
      </div>
      {activeGoals.length === 0 ? (
        <p className="list-item__secondary">
          No active goals yet. <Link to="/goals">Create a goal</Link> to start tracking progress.
        </p>
      ) : (
        <ul className="goals-progress-card__list">
          {visibleGoals.map((goal) => (
            <li key={goal.id} className="goals-progress-card__item">
              <div className="goals-progress-card__row">
                <span className="goals-progress-card__name">{goal.name}</span>
                <span className="goals-progress-card__percent">
                  {goal.percent}%{goal.isComplete ? ' ✓' : ''}
                  {goal.isComplete ? <span className="sr-only"> complete</span> : null}
                </span>
              </div>
              <div
                className="progress-bar"
                role="progressbar"
                aria-valuenow={goal.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${goal.name}: ${goal.percent} percent funded`}
              >
                <div
                  className={`progress-bar__fill progress-bar__fill--${goal.isComplete ? 'positive' : 'neutral'}`}
                  style={{ width: `${goal.percent}%` }}
                />
              </div>
              <p className="goals-progress-card__amounts list-item__secondary">
                <CurrencyDisplay
                  amount={goal.currentCents}
                  currency={goal.currency}
                  context={`${goal.name} saved`}
                />{' '}
                of{' '}
                <CurrencyDisplay
                  amount={goal.targetCents}
                  currency={goal.currency}
                  context={`${goal.name} target`}
                />
              </p>
            </li>
          ))}
        </ul>
      )}
      {remaining > 0 ? (
        <Link to="/goals" className="auth-footer__link">
          View all {activeGoals.length} goals
        </Link>
      ) : activeGoals.length > 0 ? (
        <Link to="/goals" className="auth-footer__link">
          Open Goals
        </Link>
      ) : null}
    </article>
  );
};

export default GoalsProgressCard;
