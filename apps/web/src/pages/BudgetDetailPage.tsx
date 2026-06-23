// SPDX-License-Identifier: BUSL-1.1

import React, { Suspense, useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppIcon, type IconName } from '../components/icons';

import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { CurrencyDisplay } from '../components/common/CurrencyDisplay';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { ExplainThis } from '../components/common/ExplainThis';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { BudgetForm } from '../components/forms';
import type { CreateBudgetInput } from '../db/repositories/budgets';
import { useBudgets } from '../hooks/useBudgets';
import { useCategories } from '../hooks/useCategories';
import { isFoodMealBudgetParentCategory } from '../hooks/useCategories';
import type { Budget } from '../kmp/bridge';
import { getBudgetStatusIndicator } from '../lib/a11y';
import { calculateRolloverLedger, generateVarianceInsights } from '../lib/budgeting-beta';
import '../styles/pages.css';

/*
 * Recharts is a heavy visualization dependency (recharts + redux-toolkit +
 * immer + decimal.js-light ≈ 290 KB raw). The donut chart is a secondary,
 * conditionally-rendered breakdown that is not above the fold, so we load it
 * as its own async chunk to keep the `route-ledger` bundle lean (#2983).
 */
const BudgetDonutChart = React.lazy(() =>
  import('../components/charts/BudgetDonutChart').then((module) => ({
    default: module.BudgetDonutChart,
  })),
);

/** Accessible, non-focus-trapping placeholder shown while the chart chunk loads. */
const ChartFallback = ({ label }: { readonly label: string }) => (
  <div className="card" role="status" aria-live="polite" style={{ minHeight: 260 }}>
    <LoadingSpinner size={24} label={label} />
  </div>
);

const PERIOD_LABELS: Record<string, string> = {
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Bi-weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  YEARLY: 'Yearly',
};

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

function renderBudgetIcon(iconName: string | null | undefined): React.ReactNode {
  if (iconName && iconName.length <= 4) {
    return <span aria-hidden="true">{iconName}</span>;
  }

  return <AppIcon name={getBudgetIcon(iconName)} />;
}

/** Detail view for a single budget route. */
export const BudgetDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deletingBudget, setDeletingBudget] = useState<Budget | null>(null);

  const {
    budgets,
    loading,
    error,
    refresh,
    updateBudget,
    deleteBudget,
    getBudgetSpendingBreakdown,
  } = useBudgets();
  const { categories, loading: categoriesLoading } = useCategories();

  const isLoading = loading || categoriesLoading;

  const budget = id ? (budgets.find((b) => b.id === id) ?? null) : null;

  const category = useMemo(
    () => (budget ? (categories.find((c) => c.id === budget.categoryId) ?? null) : null),
    [budget, categories],
  );
  const isFoodBudget = budget ? isFoodMealBudgetParentCategory(category, categories) : false;
  const foodBudgetBreakdown = budget && isFoodBudget ? getBudgetSpendingBreakdown(budget.id) : [];

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
  }, []);

  const handleFormSubmit = useCallback(
    async (data: CreateBudgetInput) => {
      if (!budget) return;
      const updated = updateBudget(budget.id, data);
      if (updated === null) {
        throw new Error('Failed to update budget.');
      }
      setIsFormOpen(false);
    },
    [budget, updateBudget],
  );

  const handleDeleteConfirm = useCallback(() => {
    if (!deletingBudget) return;
    const deleted = deleteBudget(deletingBudget.id);
    if (deleted) {
      setDeletingBudget(null);
      navigate('/budgets', { replace: true });
    }
  }, [deleteBudget, deletingBudget, navigate]);

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
  const budgetStatus = getBudgetStatusIndicator(percentUsed);
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percentUsed, 100) / 100) * circumference;
  const weeklyMealBudgetTarget = Math.round(budget.amount.amount / 4.33);
  const rolloverPeriod = calculateRolloverLedger([
    {
      label: budget.startDate,
      allocationCents: budget.amount.amount,
      spentCents: budget.spentAmount.amount,
    },
  ])[0];
  const varianceInsight = generateVarianceInsights(
    [
      {
        categoryId: budget.categoryId,
        name: budget.name,
        budgetedCents: budget.amount.amount,
        actualCents: budget.spentAmount.amount,
        priorActualCents: null,
      },
    ],
    1,
  )[0];

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

      <div className="page-header">
        <h2 className="page-heading">
          {renderBudgetIcon(category?.icon)} {budget.name}
        </h2>
        <div className="page-actions">
          <button
            type="button"
            className="form-button form-button--secondary"
            onClick={() => setIsFormOpen(true)}
            aria-label={`Edit ${budget.name}`}
          >
            <AppIcon name="edit" /> Edit
          </button>
          <button
            type="button"
            className="form-button confirm-dialog__confirm confirm-dialog__confirm--danger"
            onClick={() => setDeletingBudget(budget)}
            aria-label={`Delete ${budget.name}`}
          >
            <AppIcon name="trash" /> Delete
          </button>
        </div>
      </div>

      <article
        className="card"
        aria-label="Budget details"
        style={{ marginBottom: 'var(--spacing-6)' }}
      >
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-4)' }}>
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--spacing-2)',
              }}
            >
              <dt className="card__title" style={{ margin: 0 }}>
                Category
              </dt>
              <ExplainThis
                tipKey="budgetSinkingFund"
                buttonLabel="Explain sinking funds for budget categories"
              />
            </div>
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
            aria-label={`${budget.name} budget: ${percentUsed} percent used, ${budgetStatus.label}`}
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
              <AppIcon name={budgetStatus.icon} />{' '}
              {budget.remainingAmount.amount >= 0 ? (
                <>
                  <CurrencyDisplay
                    amount={budget.remainingAmount.amount}
                    currency={budget.currency.code}
                    context={`remaining in ${budget.name} budget`}
                  />{' '}
                  left
                </>
              ) : (
                <>
                  <CurrencyDisplay
                    amount={Math.abs(budget.remainingAmount.amount)}
                    currency={budget.currency.code}
                    context={`over in ${budget.name} budget`}
                  />{' '}
                  over budget
                </>
              )}
            </p>
          </div>
        </div>
      </section>

      {budget.isRollover && (
        <section aria-label="Rollover balance" style={{ marginTop: 'var(--spacing-6)' }}>
          <h3
            style={{
              fontWeight: 'var(--font-weight-semibold)',
              marginBottom: 'var(--spacing-3)',
            }}
          >
            Rollover balance
          </h3>
          <div
            className="card"
            style={{
              display: 'grid',
              gap: 'var(--spacing-4)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))',
            }}
          >
            <div>
              <p className="card__title">Beginning carryover</p>
              <p className="card__value">
                <CurrencyDisplay
                  amount={rolloverPeriod.beginningCarryoverCents}
                  currency={budget.currency.code}
                  colorize
                />
              </p>
            </div>
            <div>
              <p className="card__title">Current allocation</p>
              <p className="card__value">
                <CurrencyDisplay amount={budget.amount.amount} currency={budget.currency.code} />
              </p>
            </div>
            <div>
              <p className="card__title">Spent</p>
              <p className="card__value">
                <CurrencyDisplay
                  amount={budget.spentAmount.amount}
                  currency={budget.currency.code}
                />
              </p>
            </div>
            <div>
              <p className="card__title">Ending balance</p>
              <p className="card__value">
                <CurrencyDisplay
                  amount={rolloverPeriod.endingBalanceCents}
                  currency={budget.currency.code}
                  colorize
                />
              </p>
            </div>
          </div>
        </section>
      )}

      <section aria-label="Variance coaching" style={{ marginTop: 'var(--spacing-6)' }}>
        <h3
          style={{
            fontWeight: 'var(--font-weight-semibold)',
            marginBottom: 'var(--spacing-3)',
          }}
        >
          Variance coaching
        </h3>
        <div className="card">
          {varianceInsight ? (
            <p>
              {budget.name} is {varianceInsight.kind === 'over' ? 'over' : 'under'} by{' '}
              <CurrencyDisplay
                amount={Math.abs(varianceInsight.varianceCents)}
                currency={budget.currency.code}
              />{' '}
              ({Math.abs(varianceInsight.variancePercent)}%). {varianceInsight.action}
            </p>
          ) : (
            <p style={{ color: 'var(--semantic-text-secondary)' }}>
              This category is on track for the current period.
            </p>
          )}
        </div>
      </section>

      {isFoodBudget && (
        <section aria-label="Food & Meals breakdown" style={{ marginTop: 'var(--spacing-6)' }}>
          <h3
            style={{
              fontWeight: 'var(--font-weight-semibold)',
              marginBottom: 'var(--spacing-3)',
            }}
          >
            Food & Meals breakdown
          </h3>
          <div
            className="card"
            style={{
              display: 'grid',
              gap: 'var(--spacing-4)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
            }}
          >
            <div>
              <p className="card__title">Weekly Meal Budget</p>
              <p className="card__value">
                <CurrencyDisplay amount={weeklyMealBudgetTarget} currency={budget.currency.code} />
              </p>
              <p style={{ color: 'var(--semantic-text-secondary)' }}>
                Based on 4.33 weeks in an average month.
              </p>
            </div>
            <div>
              {foodBudgetBreakdown.length > 0 ? (
                <Suspense fallback={<ChartFallback label="Loading subcategory chart" />}>
                  <BudgetDonutChart
                    data={foodBudgetBreakdown.map((entry) => ({
                      name: entry.categoryName,
                      value: entry.spentAmount.amount,
                    }))}
                    currency={budget.currency.code}
                    height={260}
                    title="Subcategory spending"
                    centerLabel={`${foodBudgetBreakdown.length} groups`}
                  />
                </Suspense>
              ) : (
                <div>
                  <p className="card__title">Subcategory spending</p>
                  <p style={{ color: 'var(--semantic-text-secondary)' }}>
                    Add spending in Groceries, Dining Out, Delivery & Takeout, Coffee & Snacks, or
                    Meal Prep to see a breakdown.
                  </p>
                </div>
              )}
            </div>
            {foodBudgetBreakdown.length > 0 && (
              <div>
                <p className="card__title">Tracked spending</p>
                <ul style={{ display: 'grid', gap: 'var(--spacing-2)', paddingLeft: '1.25rem' }}>
                  {foodBudgetBreakdown.map((entry) => (
                    <li key={entry.categoryId}>
                      {entry.categoryName} —{' '}
                      <CurrencyDisplay
                        amount={entry.spentAmount.amount}
                        currency={budget.currency.code}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      <BudgetForm
        isOpen={isFormOpen}
        onCancel={handleCloseForm}
        onSubmit={handleFormSubmit}
        categories={categories}
        initialData={budget}
      />

      <ConfirmDialog
        isOpen={deletingBudget !== null}
        title="Delete Budget"
        message={
          deletingBudget
            ? `Are you sure you want to delete this budget? This will remove "${deletingBudget.name}" from your budgets list.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingBudget(null)}
      />
    </>
  );
};

export default BudgetDetailPage;
