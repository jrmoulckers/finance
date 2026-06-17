// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppIcon, type IconName } from '../components/icons';

import {
  ConfirmDialog,
  CurrencyDisplay,
  ErrorBanner,
  ExplainThis,
  LoadingSpinner,
} from '../components/common';
import { GoalForm } from '../components/forms';
import type { CreateGoalInput } from '../db/repositories/goals';
import { useGoals } from '../hooks';
import type { Goal } from '../kmp/bridge';
import { getGoalStatusIndicator } from '../lib/a11y';
import '../styles/pages.css';

function getGoalIcon(iconName: string | null | undefined): IconName {
  switch (iconName) {
    case 'shield':
      return 'shield';
    case 'plane':
      return 'plane';
    case 'home':
      return 'home';
    case 'laptop':
      return 'laptop';
    default:
      return 'target';
  }
}

/** Detail view for a single goal route. */
export const GoalDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deletingGoal, setDeletingGoal] = useState<Goal | null>(null);

  const { goals, loading, error, refresh, updateGoal, deleteGoal } = useGoals();

  const goal = id ? (goals.find((g) => g.id === id) ?? null) : null;

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
  }, []);

  const handleFormSubmit = useCallback(
    async (data: CreateGoalInput) => {
      if (!goal) return;
      const updated = updateGoal(goal.id, data);
      if (updated === null) {
        throw new Error('Failed to update goal.');
      }
      setIsFormOpen(false);
    },
    [goal, updateGoal],
  );

  const handleDeleteConfirm = useCallback(() => {
    if (!deletingGoal) return;
    const deleted = deleteGoal(deletingGoal.id);
    if (deleted) {
      setDeletingGoal(null);
      navigate('/goals', { replace: true });
    }
  }, [deleteGoal, deletingGoal, navigate]);

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

  const goalStatus = getGoalStatusIndicator(percentComplete);

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

  const goalDescription = goal.description?.trim() || null;

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

      <div className="page-header">
        <h2 className="page-heading">
          <AppIcon name={getGoalIcon(goal.icon)} /> {goal.name}
        </h2>
        <div className="page-actions">
          <button
            type="button"
            className="form-button form-button--secondary"
            onClick={() => setIsFormOpen(true)}
            aria-label={`Edit ${goal.name}`}
          >
            <AppIcon name="edit" /> Edit
          </button>
          <button
            type="button"
            className="form-button confirm-dialog__confirm confirm-dialog__confirm--danger"
            onClick={() => setDeletingGoal(goal)}
            aria-label={`Delete ${goal.name}`}
          >
            <AppIcon name="trash" /> Delete
          </button>
        </div>
      </div>

      <article
        className="card"
        aria-label="Goal details"
        style={{ marginBottom: 'var(--spacing-6)' }}
      >
        {goalDescription && (
          <div style={{ marginBottom: 'var(--spacing-4)' }}>
            <h3 className="card__title">Description</h3>
            <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{goalDescription}</p>
          </div>
        )}
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
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--spacing-2)',
            marginBottom: 'var(--spacing-3)',
          }}
        >
          <h3
            style={{
              fontWeight: 'var(--font-weight-semibold)',
              margin: 0,
            }}
          >
            Progress
          </h3>
          <ExplainThis
            tipKey="goalCompoundInterest"
            buttonLabel="Explain compound interest for goal progress"
          />
        </div>
        <div
          className="card"
          aria-label={`${goal.name}: ${percentComplete}% complete, ${goalStatus.label}`}
        >
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
              context={`saved for ${goal.name}`}
            />
            <CurrencyDisplay
              amount={goal.targetAmount.amount}
              currency={goal.currency.code}
              context={`target for ${goal.name}`}
            />
          </div>
          <div
            className="progress-bar"
            role="progressbar"
            aria-valuenow={Math.min(percentComplete, 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${goal.name}: ${percentComplete} percent of goal reached, ${goalStatus.label}`}
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
              <AppIcon name={goalStatus.icon} />{' '}
              {percentComplete >= 100 ? (
                'Goal reached!'
              ) : (
                <>
                  <CurrencyDisplay
                    amount={remainingAmount}
                    currency={goal.currency.code}
                    context={`remaining for ${goal.name} goal`}
                  />{' '}
                  to go ({percentComplete}%)
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

      <GoalForm
        isOpen={isFormOpen}
        onCancel={handleCloseForm}
        onSubmit={handleFormSubmit}
        initialData={goal}
      />

      <ConfirmDialog
        isOpen={deletingGoal !== null}
        title="Delete Goal"
        message={
          deletingGoal
            ? `Are you sure you want to delete this goal? This will remove "${deletingGoal.name}" from your goals list.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingGoal(null)}
      />
    </>
  );
};

export default GoalDetailPage;
