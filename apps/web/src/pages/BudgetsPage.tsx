// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ConfirmDialog,
  CurrencyDisplay,
  EmptyState,
  ErrorBanner,
  LoadingSpinner,
} from '../components/common';
import { BudgetForm } from '../components/forms';
import type { CreateBudgetInput } from '../db/repositories/budgets';
import { useBudgets, useCategories } from '../hooks';
import type { Budget } from '../kmp/bridge';

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
  const { budgets, loading, error, refresh, createBudget, updateBudget, deleteBudget } =
    useBudgets();
  const {
    categories,
    loading: categoriesLoading,
    error: categoriesError,
    refresh: refreshCategories,
  } = useCategories();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [deletingBudget, setDeletingBudget] = useState<Budget | null>(null);

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

  /** Open the budget dialog in create mode. */
  const handleAddBudget = useCallback(() => {
    setEditingBudget(null);
    setIsFormOpen(true);
  }, []);

  /** Open the budget dialog in edit mode for the selected budget. */
  const handleEditBudget = useCallback((budget: Budget) => {
    setEditingBudget(budget);
    setIsFormOpen(true);
  }, []);

  /** Open the delete confirmation dialog for the selected budget. */
  const handleDeleteBudget = useCallback((budget: Budget) => {
    setDeletingBudget(budget);
  }, []);

  /** Close the budget form dialog without saving. */
  const handleFormCancel = useCallback(() => {
    setIsFormOpen(false);
    setEditingBudget(null);
  }, []);

  /** Close the delete confirmation dialog without deleting. */
  const handleDeleteCancel = useCallback(() => {
    setDeletingBudget(null);
  }, []);

  /** Create or update a budget, depending on the active dialog mode. */
  const handleFormSubmit = useCallback(
    async (data: CreateBudgetInput) => {
      if (editingBudget) {
        const updatedBudget = updateBudget(editingBudget.id, data);
        if (updatedBudget === null) {
          throw new Error('Failed to update budget.');
        }
      } else {
        const createdBudget = createBudget(data);
        if (createdBudget === null) {
          throw new Error('Failed to create budget.');
        }
      }

      setIsFormOpen(false);
      setEditingBudget(null);
    },
    [createBudget, editingBudget, updateBudget],
  );

  /** Delete the selected budget after the user confirms the action. */
  const handleDeleteConfirm = useCallback(() => {
    if (!deletingBudget) {
      return;
    }

    const deleted = deleteBudget(deletingBudget.id);
    if (deleted) {
      setDeletingBudget(null);
    }
  }, [deleteBudget, deletingBudget]);

  const totalBudgeted = budgets.reduce((sum, budget) => sum + budget.amount.amount, 0);
  const totalSpent = budgets.reduce((sum, budget) => sum + budget.spentAmount.amount, 0);
  const totalRemaining = budgets.reduce((sum, budget) => sum + budget.remainingAmount.amount, 0);

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--spacing-6)',
          gap: 'var(--spacing-4)',
          flexWrap: 'wrap',
        }}
      >
        <h2
          style={{
            fontSize: 'var(--type-scale-headline-font-size)',
            fontWeight: 'var(--type-scale-headline-font-weight)',
          }}
        >
          Budgets
        </h2>
        <button
          type="button"
          className="form-button form-button--primary"
          onClick={handleAddBudget}
          aria-label="Add budget"
        >
          + Add Budget
        </button>
      </div>

      <BudgetForm
        isOpen={isFormOpen}
        onCancel={handleFormCancel}
        onSubmit={handleFormSubmit}
        categories={categories}
        initialData={editingBudget ?? undefined}
      />
      <ConfirmDialog
        isOpen={deletingBudget !== null}
        title="Delete Budget"
        message={
          deletingBudget
            ? `Delete the ${deletingBudget.name} budget? This will remove it from your budgets list.`
            : ''
        }
        confirmLabel="Delete Budget"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
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
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 'var(--spacing-3)',
                        }}
                      >
                        <div>
                          <p style={{ fontWeight: 'var(--font-weight-semibold)' }}>
                            <Link
                              to={`/budgets/${budget.id}`}
                              style={{ textDecoration: 'none', color: 'inherit' }}
                              aria-label={`View details for ${budget.name}`}
                            >
                              <span aria-hidden="true">{getBudgetIcon(category?.icon)}</span>{' '}
                              {budget.name}
                            </Link>
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
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
                          <button
                            type="button"
                            onClick={() => handleEditBudget(budget)}
                            aria-label={`Edit ${budget.name}`}
                            title="Edit budget"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '2.25rem',
                              height: '2.25rem',
                              border: '1px solid var(--semantic-border-default)',
                              borderRadius: 'var(--border-radius-md)',
                              backgroundColor:
                                'var(--semantic-surface-primary, var(--card-background))',
                              color: 'var(--semantic-text-primary)',
                              cursor: 'pointer',
                            }}
                          >
                            <span aria-hidden="true">✏️</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteBudget(budget)}
                            aria-label={`Delete ${budget.name}`}
                            title="Delete budget"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '2.25rem',
                              height: '2.25rem',
                              border: '1px solid var(--semantic-border-default)',
                              borderRadius: 'var(--border-radius-md)',
                              backgroundColor:
                                'var(--semantic-surface-primary, var(--card-background))',
                              color: 'var(--semantic-status-negative)',
                              cursor: 'pointer',
                            }}
                          >
                            <span aria-hidden="true">🗑️</span>
                          </button>
                        </div>
                      </div>
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
