// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ConfirmDialog,
  CurrencyDisplay,
  EmptyState,
  ErrorBanner,
  LoadingSpinner,
} from '../components/common';
import { GoalForm } from '../components/forms';
import type { CreateGoalInput } from '../db/repositories/goals';
import { useGoals } from '../hooks';
import type { Goal } from '../kmp/bridge';

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
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [deletingGoal, setDeletingGoal] = useState<Goal | null>(null);
  const [isDeletingGoal, setIsDeletingGoal] = useState(false);
  const { goals, loading, error, refresh, createGoal, updateGoal, deleteGoal } = useGoals();
  const totalTarget = goals.reduce((sum, goal) => sum + goal.targetAmount.amount, 0);
  const totalSaved = goals.reduce((sum, goal) => sum + goal.currentAmount.amount, 0);

  const handleOpenForm = useCallback(() => {
    setEditingGoal(null);
    setIsFormOpen(true);
  }, []);

  const handleEditGoal = useCallback((goal: Goal) => {
    setEditingGoal(goal);
    setIsFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setEditingGoal(null);
    setIsFormOpen(false);
  }, []);

  const handleRequestDelete = useCallback((goal: Goal) => {
    setDeletingGoal(goal);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setDeletingGoal(null);
  }, []);

  const handleSubmitGoal = useCallback(
    async (data: CreateGoalInput) => {
      if (editingGoal !== null) {
        const updatedGoal = updateGoal(editingGoal.id, data);
        if (updatedGoal === null) {
          throw new Error('Failed to update goal.');
        }
      } else {
        const createdGoal = createGoal(data);
        if (createdGoal === null) {
          throw new Error('Failed to create goal.');
        }
      }

      setEditingGoal(null);
      setIsFormOpen(false);
    },
    [createGoal, editingGoal, updateGoal],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (deletingGoal === null) {
      return;
    }

    setIsDeletingGoal(true);

    try {
      const deletedGoal = deleteGoal(deletingGoal.id);
      if (!deletedGoal) {
        throw new Error('Failed to delete goal.');
      }

      setDeletingGoal(null);
    } finally {
      setIsDeletingGoal(false);
    }
  }, [deleteGoal, deletingGoal]);

  return (
    <>
      <div className="page-section__header" style={{ marginBottom: 'var(--spacing-6)' }}>
        <h2
          style={{
            fontSize: 'var(--type-scale-headline-font-size)',
            fontWeight: 'var(--type-scale-headline-font-weight)',
            marginBottom: 0,
          }}
        >
          Goals
        </h2>
        <button
          type="button"
          className="form-button form-button--primary"
          onClick={handleOpenForm}
          aria-label="Add a new goal"
        >
          Add Goal
        </button>
      </div>
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
                        alignItems: 'flex-start',
                        gap: 'var(--spacing-3)',
                        marginBottom: 'var(--spacing-3)',
                      }}
                    >
                      <h3 style={{ fontWeight: 'var(--font-weight-semibold)' }}>
                        <Link
                          to={`/goals/${goal.id}`}
                          style={{ textDecoration: 'none', color: 'inherit' }}
                          aria-label={`View details for ${goal.name}`}
                        >
                          <span aria-hidden="true">{getGoalIcon(goal.icon)}</span> {goal.name}
                        </Link>
                      </h3>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--spacing-2)',
                        }}
                      >
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
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-1)' }}
                        >
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => handleEditGoal(goal)}
                            aria-label={`Edit ${goal.name}`}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => handleRequestDelete(goal)}
                            aria-label={`Delete ${goal.name}`}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="M19 6l-1 14H6L5 6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                            </svg>
                          </button>
                        </div>
                      </div>
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
      <GoalForm
        isOpen={isFormOpen}
        onCancel={handleCloseForm}
        onSubmit={handleSubmitGoal}
        initialData={editingGoal ?? undefined}
      />
      <ConfirmDialog
        isOpen={deletingGoal !== null}
        title="Delete goal?"
        message={
          deletingGoal === null
            ? ''
            : `Are you sure you want to delete “${deletingGoal.name}”? This action cannot be undone.`
        }
        confirmLabel="Delete Goal"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        isLoading={isDeletingGoal}
      />
    </>
  );
};

export default GoalsPage;
