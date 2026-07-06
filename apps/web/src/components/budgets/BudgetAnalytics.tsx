// SPDX-License-Identifier: BUSL-1.1

/**
 * Budget Analytics Dashboard component.
 *
 * Displays five analytics widgets: savings rate, spending trajectory,
 * budget health indicator, period-over-period comparison, and category
 * trends. All calculations use pure functions from `budget-analytics.ts`.
 *
 * Data is accessed exclusively through hooks (useBudgets); this component
 * receives pre-computed data via props to keep it testable without providers.
 *
 * References: issue #1517
 */

import React from 'react';
import { CurrencyDisplay, ExplainThis } from '../common';
import {
  buildCategoryTrends,
  calculateSavingsRate,
  calculateSpendingTrajectory,
  comparePeriods,
  getBudgetHealth,
  projectCategoryOverspend,
  type BudgetHealthStatus,
  type CategoryProjection,
  type CategoryTrend,
  type ChangeDirection,
} from '../../lib/budget-analytics';
import './budget-analytics.css';
import { AppIcon, type IconName } from '../icons';
import { formatCurrencyForScreenReader } from '../../lib/a11y';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props for the BudgetAnalytics dashboard. */
export interface BudgetAnalyticsProps {
  /** Total income for the current period (cents). */
  totalIncome: number;
  /** Total spending for the current period (cents). */
  totalSpent: number;
  /** Total budgeted amount for the current period (cents). */
  totalBudget: number;
  /** Number of days elapsed in the current period. */
  daysElapsed: number;
  /** Total number of days in the current period. */
  totalDays: number;
  /** Total spending in the previous period (cents). Null if unavailable. */
  previousPeriodSpent: number | null;
  /** Map of category name → spending in current period (cents). */
  currentCategorySpending: ReadonlyMap<string, number>;
  /** Map of category name → spending in previous period (cents). */
  previousCategorySpending: ReadonlyMap<string, number>;
  /**
   * Map of category name → budgeted amount for the current period (cents).
   * Used to project per-category overspend. Omitted maps disable the warning.
   */
  categoryBudgets?: ReadonlyMap<string, number>;
  /** ISO 4217 currency code (default: "USD"). */
  currency?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const HEALTH_LABELS: Record<BudgetHealthStatus, string> = {
  'on-track': 'On Track',
  'at-risk': 'At Risk',
  'over-budget': 'Over Budget',
};

const HEALTH_ICONS: Record<BudgetHealthStatus, IconName> = {
  'on-track': 'check',
  'at-risk': 'alert-triangle',
  'over-budget': 'x',
};

/** Renders the traffic-light budget health indicator with text + icon. */
function HealthIndicator({ status }: { status: BudgetHealthStatus }) {
  return (
    <span
      className={`health-indicator health-indicator--${status}`}
      role="status"
      aria-label={`Budget health: ${HEALTH_LABELS[status]}`}
    >
      <span className="health-indicator__icon" aria-hidden="true" />
      <span className="health-indicator__label">
        <AppIcon name={HEALTH_ICONS[status]} /> {HEALTH_LABELS[status]}
      </span>
    </span>
  );
}

/** Renders a directional arrow with percentage change, or a "New" badge when
 * there is no prior-period baseline to compute a percentage from. */
function ComparisonArrow({
  change,
  direction,
  isNew = false,
}: {
  change: number;
  direction: ChangeDirection;
  isNew?: boolean;
}) {
  const arrowMap: Record<ChangeDirection, string> = {
    up: '↑',
    down: '↓',
    flat: '→',
  };

  return (
    <span className={`comparison-arrow comparison-arrow--${direction}`} aria-hidden="true">
      {arrowMap[direction]} {isNew ? 'New' : `${change}%`}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/** Budget analytics dashboard with five widget cards. */
export const BudgetAnalytics: React.FC<BudgetAnalyticsProps> = ({
  totalIncome,
  totalSpent,
  totalBudget,
  daysElapsed,
  totalDays,
  previousPeriodSpent,
  currentCategorySpending,
  previousCategorySpending,
  categoryBudgets,
  currency = 'USD',
}) => {
  // Compute analytics
  const savingsRate = calculateSavingsRate(totalIncome, totalSpent);
  const projectedSpending = calculateSpendingTrajectory(totalSpent, daysElapsed, totalDays);
  const health = getBudgetHealth(totalSpent, totalBudget, daysElapsed, totalDays);
  const daysRemaining = Math.max(0, totalDays - daysElapsed);

  const periodComparison =
    previousPeriodSpent !== null ? comparePeriods(totalSpent, previousPeriodSpent) : null;

  const categoryTrends = buildCategoryTrends(currentCategorySpending, previousCategorySpending, 5);

  // Per-category early overspend projection (only when budgets are provided).
  const categoryOverspend = categoryBudgets
    ? projectCategoryOverspend(
        [...currentCategorySpending].map(([name, spentCents]) => ({
          name,
          spentCents,
          budgetCents: categoryBudgets.get(name) ?? 0,
        })),
        daysElapsed,
        totalDays,
      )
    : new Map<string, CategoryProjection>();

  // Progress bar percentage (capped at 100% visually)
  const progressPercent = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0;

  // Max spending for category bar scaling
  const maxCategorySpending =
    categoryTrends.length > 0 ? Math.max(...categoryTrends.map((t) => t.current)) : 0;

  return (
    <section className="budget-analytics" aria-label="Budget analytics">
      {/* Savings Rate Card */}
      <article className="analytics-card" aria-label="Savings rate">
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--spacing-2)',
          }}
        >
          <h3 className="analytics-card__title">Savings Rate</h3>
          <ExplainThis tipKey="goodSavingsRate" />
        </div>
        <p className="analytics-card__value">{savingsRate}%</p>
        <p className="analytics-card__detail">
          {savingsRate >= 0
            ? `Saving ${savingsRate}% of income this period`
            : `Overspending by ${Math.abs(savingsRate)}% of income`}
        </p>
      </article>

      {/* Spending Trajectory Card */}
      <article className="analytics-card" aria-label="Spending trajectory">
        <h3 className="analytics-card__title">Spending Trajectory</h3>
        <p className="analytics-card__value">
          <CurrencyDisplay amount={projectedSpending} currency={currency} />
        </p>
        <p className="analytics-card__detail">
          On pace to spend <CurrencyDisplay amount={projectedSpending} currency={currency} /> by end
          of period
        </p>
        <div
          className="trajectory-bar"
          role="progressbar"
          aria-valuenow={Math.round(progressPercent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${Math.round(progressPercent)}% of budget spent`}
        >
          <div
            className={`trajectory-bar__fill trajectory-bar__fill--${health}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="analytics-card__detail">
          <CurrencyDisplay amount={totalSpent} currency={currency} /> of{' '}
          <CurrencyDisplay amount={totalBudget} currency={currency} /> spent
        </p>
      </article>

      {/* Budget Health Indicator Card */}
      <article className="analytics-card" aria-label="Budget health">
        <h3 className="analytics-card__title">Budget Health</h3>
        <HealthIndicator status={health} />
        <p className="analytics-card__detail">
          {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining in period
        </p>
      </article>

      {/* Period Comparison Card */}
      <article className="analytics-card" aria-label="Period comparison">
        <h3 className="analytics-card__title">vs. Last Period</h3>
        {periodComparison ? (
          <>
            <p className="analytics-card__value">
              <ComparisonArrow
                change={periodComparison.change}
                direction={periodComparison.direction}
                isNew={periodComparison.isNew}
              />
            </p>
            <p
              className="analytics-card__detail"
              aria-label={
                periodComparison.isNew
                  ? 'New spending this period; there was nothing spent last period to compare against'
                  : `Spending is ${periodComparison.change}% ${periodComparison.direction === 'down' ? 'lower' : periodComparison.direction === 'up' ? 'higher' : 'the same as'} than last period`
              }
            >
              {periodComparison.isNew ? (
                'New spending this period (nothing spent last period)'
              ) : (
                <>
                  Spending is {periodComparison.change}%{' '}
                  {periodComparison.direction === 'down'
                    ? 'lower'
                    : periodComparison.direction === 'up'
                      ? 'higher'
                      : 'the same as'}{' '}
                  than last period
                </>
              )}
            </p>
          </>
        ) : (
          <p className="analytics-empty">Not enough data for comparison</p>
        )}
      </article>

      {/* Category Trends Card */}
      <article className="analytics-card analytics-card--wide" aria-label="Category trends">
        <h3 className="analytics-card__title">Top Categories</h3>
        {categoryTrends.length > 0 ? (
          <CategoryTrendsList
            trends={categoryTrends}
            maxSpending={maxCategorySpending}
            overspendByName={categoryOverspend}
            currency={currency}
          />
        ) : (
          <p className="analytics-empty">No category data available</p>
        )}
      </article>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Category trends sub-component
// ---------------------------------------------------------------------------

function CategoryTrendsList({
  trends,
  maxSpending,
  overspendByName,
  currency,
}: {
  trends: CategoryTrend[];
  maxSpending: number;
  overspendByName: ReadonlyMap<string, CategoryProjection>;
  currency: string;
}) {
  return (
    <ul className="category-trends__list" role="list" aria-label="Top spending categories">
      {trends.map((trend) => {
        const barPercent = maxSpending > 0 ? (trend.current / maxSpending) * 100 : 0;
        const overspend = overspendByName.get(trend.name);
        const trendSummary = trend.isNew
          ? 'new spending this period'
          : `${trend.change}% ${trend.direction}`;
        const overspendSummary = overspend
          ? `, on pace to overspend by ${formatCurrencyForScreenReader(overspend.overspendCents, currency)}`
          : '';

        return (
          <li
            key={trend.name}
            className="category-trends__item"
            role="listitem"
            aria-label={`${trend.name}: ${trendSummary}${overspendSummary}`}
          >
            <span className="category-trends__name">{trend.name}</span>
            <div
              className="category-trends__bar-container"
              role="progressbar"
              aria-valuenow={trend.current}
              aria-valuemin={0}
              aria-valuemax={maxSpending}
              aria-label={`${trend.name} spending`}
            >
              <div className="category-trends__bar" style={{ width: `${barPercent}%` }} />
            </div>
            <span className="category-trends__change">
              <ComparisonArrow
                change={trend.change}
                direction={trend.direction}
                isNew={trend.isNew}
              />{' '}
              <CurrencyDisplay amount={trend.current} currency={currency} />
            </span>
            {overspend && (
              <span className="category-trends__overspend" aria-hidden="true">
                <AppIcon name="alert-triangle" /> On pace to overspend by{' '}
                <CurrencyDisplay amount={overspend.overspendCents} currency={currency} />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default BudgetAnalytics;
