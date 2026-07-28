// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AppIcon, type IconName } from '../components/icons';
import { pluralize } from '../lib/ui/pluralize';

import {
  ConfirmDialog,
  CurrencyDisplay,
  ErrorBanner,
  ExplainThis,
  LoadingSpinner,
} from '../components/common';
import { GoalForm } from '../components/forms';
import type { CreateGoalInput, GoalContributionInput } from '../db/repositories/goals';
import { useAccounts, useGoals } from '../hooks';
import type { Goal } from '../kmp/bridge';
import { getGoalStatusIndicator } from '../lib/a11y';
import { getCurrentLocale } from '../lib/i18n';
import { getGoalDueStatus, getGoalProgress } from '../lib/goals';
import { GoalStatusBadge } from '../components/goals/GoalStatusBadge';
import { ShareCelebrationButton } from '../components/social/ShareCelebrationButton';
import { SharedGoalContributions } from '../components/goals/SharedGoalContributions';
import { GoalContributionDialog } from '../components/goals/GoalContributionDialog';
import { goalCelebrationEvent } from '../lib/social/share-celebration';
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

/** Format a whole-cent amount as localized currency for use in text/aria. */
function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat(getCurrentLocale(), {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

/** Detail view for a single goal route. */
export const GoalDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deletingGoal, setDeletingGoal] = useState<Goal | null>(null);
  const [isContributeOpen, setIsContributeOpen] = useState(false);

  const { goals, loading, error, refresh, updateGoal, deleteGoal, contributeToGoal } = useGoals();
  const { accounts } = useAccounts();

  const goal = id ? (goals.find((g) => g.id === id) ?? null) : null;

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
  }, []);

  const handleFormSubmit = useCallback(
    async (data: CreateGoalInput) => {
      if (!goal) return;
      const updated = await updateGoal(goal.id, data);
      if (updated === null) {
        throw new Error('Failed to update goal.');
      }
      setIsFormOpen(false);
    },
    [goal, updateGoal],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingGoal) return;
    const deleted = await deleteGoal(deletingGoal.id);
    if (deleted) {
      setDeletingGoal(null);
      navigate('/goals', { replace: true });
    }
  }, [deleteGoal, deletingGoal, navigate]);

  const handleContributionSubmit = useCallback(
    async (input: GoalContributionInput) => {
      const updated = await contributeToGoal(input.goalId, input);
      if (updated === null) {
        throw new Error('Failed to contribute to goal.');
      }
      setIsContributeOpen(false);
    },
    [contributeToGoal],
  );

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

  const progress = getGoalProgress(goal);
  const percentComplete = progress.displayPercent;

  const goalStatus = getGoalStatusIndicator(progress.rawPercent);

  const shareEvent = goalCelebrationEvent({
    goalName: goal.name,
    percentComplete,
    amountCents: goal.currentAmount.amount,
    currency: goal.currency.code,
  });

  const remainingAmount = progress.remainingCents;

  const dueStatus = getGoalDueStatus(goal.targetDate);
  const dueCountdownLabel = !dueStatus.hasDate
    ? null
    : dueStatus.isPastDue
      ? 'Past due'
      : dueStatus.isDueToday
        ? 'Due today'
        : `${dueStatus.daysDelta} ${pluralize(dueStatus.daysDelta ?? 0, 'day')} left`;

  const targetDate = goal.targetDate ? new Date(`${goal.targetDate}T00:00:00`) : null;

  const formattedTargetDate =
    targetDate !== null
      ? targetDate.toLocaleDateString(getCurrentLocale(), {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : null;

  const fundingAccount = goal.accountId
    ? (accounts.find((account) => account.id === goal.accountId) ?? null)
    : null;

  const progressValueText = `${formatMoney(goal.currentAmount.amount, goal.currency.code)} of ${formatMoney(
    goal.targetAmount.amount,
    goal.currency.code,
  )} saved, ${percentComplete}%`;

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
          {shareEvent && (
            <ShareCelebrationButton event={shareEvent} label={`Share ${goal.name} progress`} />
          )}
          <button
            type="button"
            className="form-button form-button--primary"
            onClick={() => setIsContributeOpen(true)}
            aria-label={`Contribute to ${goal.name}`}
          >
            <AppIcon name="wallet" /> Contribute
          </button>
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
            <dd>
              <GoalStatusBadge status={goal.status} />
            </dd>
          </div>
          <div>
            <dt className="card__title">Target Date</dt>
            <dd>{formattedTargetDate ?? 'No target date'}</dd>
          </div>
          {dueCountdownLabel !== null && (
            <div>
              <dt className="card__title">Time Remaining</dt>
              <dd>{dueCountdownLabel}</dd>
            </div>
          )}
          <div>
            <dt className="card__title">Funding Account</dt>
            <dd>
              {fundingAccount ? (
                <Link to={`/accounts/${fundingAccount.id}`}>{fundingAccount.name}</Link>
              ) : (
                'No linked account'
              )}
            </dd>
          </div>
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
            aria-valuenow={percentComplete}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={progressValueText}
            aria-label={`${goal.name}: ${percentComplete} percent of goal reached, ${goalStatus.label}`}
          >
            <div
              className={`progress-bar__fill progress-bar__fill--${goalStatus.tone}`}
              style={{ width: `${percentComplete}%` }}
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
              {progress.isComplete ? (
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
            <span>{dueCountdownLabel ?? 'No due date'}</span>
          </div>
          {progress.overageCents > 0 && (
            <p
              style={{
                marginTop: 'var(--spacing-2)',
                marginBottom: 0,
                fontSize: 'var(--type-scale-caption-font-size)',
                color: 'var(--semantic-status-positive)',
              }}
            >
              <AppIcon name="check" />{' '}
              <CurrencyDisplay
                amount={progress.overageCents}
                currency={goal.currency.code}
                context={`saved over target for ${goal.name}`}
              />{' '}
              over target
            </p>
          )}
        </div>
      </section>

      <SharedGoalContributions goal={goal} />

      <GoalContributionDialog
        isOpen={isContributeOpen}
        goal={isContributeOpen ? goal : null}
        onSubmit={handleContributionSubmit}
        onCancel={() => setIsContributeOpen(false)}
      />

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
