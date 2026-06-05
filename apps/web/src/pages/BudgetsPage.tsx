// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BudgetAnalytics } from '../components/budgets';
import {
  ConfirmDialog,
  CurrencyDisplay,
  EmptyState,
  ErrorBanner,
  LoadingSpinner,
} from '../components/common';
import { BudgetForm } from '../components/forms';
import { OfflineBanner } from '../components/OfflineBanner';
import type { CreateBudgetInput } from '../db/repositories/budgets';
import { useBudgets, useCategories } from '../hooks';
import type { Budget } from '../kmp/bridge';
import { getBudgetStatusIndicator } from '../lib/a11y';
import { AppIcon, type IconName } from '../components/icons';

function getBudgetIcon(iconName: string | null | undefined): IconName {
  switch (iconName) {
    case 'utensils':
      return 'shopping-cart';
    case 'home':
      return 'home';
    case 'car':
      return 'car';
    case 'film':
      return 'film';
    case 'wallet':
      return 'wallet';
    default:
      return 'chart-bar';
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

  // Budget analytics data
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysElapsed = now.getDate();

  const currentCategorySpending = useMemo(() => {
    const map = new Map<string, number>();
    for (const budget of budgets) {
      const category = categoriesById.get(budget.categoryId);
      const name = category?.name ?? budget.name;
      map.set(name, (map.get(name) ?? 0) + budget.spentAmount.amount);
    }
    return map;
  }, [budgets, categoriesById]);

  return (
    <>
      <OfflineBanner />
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
          <BudgetAnalytics
            totalIncome={totalBudgeted}
            totalSpent={totalSpent}
            totalBudget={totalBudgeted}
            daysElapsed={daysElapsed}
            totalDays={daysInMonth}
            previousPeriodSpent={null}
            currentCategorySpending={currentCategorySpending}
            previousCategorySpending={new Map()}
          />
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
                const budgetStatus = getBudgetStatusIndicator(percentUsed);
                const radius = 36;
                const circumference = 2 * Math.PI * radius;
                const offset = circumference - (Math.min(percentUsed, 100) / 100) * circumference;
                const category = categoriesById.get(budget.categoryId);

                return (
                  <article
                    key={budget.id}
                    className="card"
                    aria-label={`${budget.name}: ${percentUsed}% used, ${budgetStatus.label}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-4)' }}
                  >
                    <div
                      className="progress-ring"
                      role="progressbar"
                      aria-valuenow={Math.min(percentUsed, 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${budget.name} budget: ${percentUsed} percent used, ${budgetStatus.label}`}
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
                              <AppIcon name={getBudgetIcon(category?.icon)} /> {budget.name}
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
                            className="icon-button"
                            onClick={() => handleEditBudget(budget)}
                            aria-label={`Edit ${budget.name}`}
                            title="Edit budget"
                          >
                            <AppIcon name="edit" />
                          </button>
                          <button
                            type="button"
                            className="icon-button icon-button--delete"
                            onClick={() => handleDeleteBudget(budget)}
                            aria-label={`Delete ${budget.name}`}
                            title="Delete budget"
                          >
                            <AppIcon name="trash" />
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
                        <AppIcon name={budgetStatus.icon} />{' '}
                        {remainingAmount >= 0 ? (
                          <>
                            <CurrencyDisplay
                              amount={remainingAmount}
                              currency={budget.currency.code}
                              context={`remaining in ${budget.name} budget`}
                            />{' '}
                            left
                          </>
                        ) : (
                          <>
                            <CurrencyDisplay
                              amount={Math.abs(remainingAmount)}
                              currency={budget.currency.code}
                              context={`over in ${budget.name} budget`}
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
