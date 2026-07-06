// SPDX-License-Identifier: BUSL-1.1

/**
 * Pure analytics utility functions for budget data.
 *
 * All functions are stateless and side-effect free, making them
 * straightforward to unit test and safe to call from any context.
 *
 * Monetary values are expected in cents (integer arithmetic).
 *
 * References: issue #1517
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Budget health classification based on daily spending rate. */
export type BudgetHealthStatus = 'on-track' | 'at-risk' | 'over-budget';

/** Direction of change between two periods. */
export type ChangeDirection = 'up' | 'down' | 'flat';

/** Result of comparing two period values. */
export interface PeriodComparison {
  /** Percentage change (positive = increase, negative = decrease). */
  readonly change: number;
  /** Whether spending went up, down, or stayed flat. */
  readonly direction: ChangeDirection;
  /**
   * True when the previous value was zero and the current value is non-zero, so
   * there is no baseline to compute a percentage from. In this case `change` is
   * not meaningful (it is reported as 0); consumers should render an honest
   * "new" state or an absolute delta rather than a misleading percentage.
   */
  readonly isNew?: boolean;
}

/** Spending data for a single category across two periods. */
export interface CategoryTrend {
  /** Display name of the category. */
  readonly name: string;
  /** Spending in the current period (cents). */
  readonly current: number;
  /** Spending in the previous period (cents). */
  readonly previous: number;
  /** Percentage change from previous to current. */
  readonly change: number;
  /** Direction of the change. */
  readonly direction: ChangeDirection;
  /**
   * True when there was no spending in the previous period, so `change` has no
   * meaningful baseline. Consumers should render a "new" state instead.
   */
  readonly isNew?: boolean;
}

/** Per-category end-of-period spend projection used for early overspend warnings. */
export interface CategoryProjection {
  /** Display name of the category. */
  readonly name: string;
  /** Projected end-of-period spend in cents at the current daily pace. */
  readonly projectedCents: number;
  /** The category's budget for the period (cents). */
  readonly budgetCents: number;
  /** Amount the projection exceeds the budget by (cents); 0 when within budget. */
  readonly overspendCents: number;
}

/** Per-category spent-so-far and budget amounts used to project overspend. */
export interface CategoryProjectionInput {
  /** Display name of the category. */
  readonly name: string;
  /** Amount already spent this period (cents). */
  readonly spentCents: number;
  /** Budgeted amount for this category this period (cents). */
  readonly budgetCents: number;
}

// ---------------------------------------------------------------------------
// Core calculations
// ---------------------------------------------------------------------------

/**
 * Calculate the savings rate as a percentage of income.
 *
 * @param income - Total income in cents.
 * @param spending - Total spending in cents (positive value).
 * @returns Percentage saved (0–100 when spending ≤ income, negative if overspent).
 *          Returns 0 when income is zero to avoid division by zero.
 */
export function calculateSavingsRate(income: number, spending: number): number {
  if (income <= 0) {
    return 0;
  }
  return Math.round(((income - spending) / income) * 100);
}

/**
 * Project total spending by end of period based on the current daily rate.
 *
 * @param spentSoFar - Amount spent so far in cents.
 * @param daysElapsed - Number of days elapsed in the period (must be > 0).
 * @param totalDays - Total number of days in the period.
 * @returns Projected total spending in cents for the full period.
 *          Returns `spentSoFar` when `daysElapsed` is 0 (no rate data yet).
 */
export function calculateSpendingTrajectory(
  spentSoFar: number,
  daysElapsed: number,
  totalDays: number,
): number {
  if (daysElapsed <= 0) {
    return spentSoFar;
  }
  const dailyRate = spentSoFar / daysElapsed;
  return Math.round(dailyRate * totalDays);
}

/**
 * Determine budget health by comparing actual daily spend rate to the
 * expected daily rate.
 *
 * - **on-track**: actual daily rate ≤ expected daily rate
 * - **at-risk**: actual daily rate is 1–20% above expected
 * - **over-budget**: actual daily rate is > 20% above expected, or already exceeded budget
 *
 * @param spent - Amount spent so far in cents.
 * @param budget - Total budget for the period in cents.
 * @param daysElapsed - Days elapsed in the current period.
 * @param totalDays - Total days in the period.
 * @returns Budget health status.
 */
export function getBudgetHealth(
  spent: number,
  budget: number,
  daysElapsed: number,
  totalDays: number,
): BudgetHealthStatus {
  // Already exceeded budget (spent more than budgeted, not equal)
  if (spent > budget) {
    return 'over-budget';
  }

  // No budget set or period not started
  if (budget <= 0 || totalDays <= 0 || daysElapsed <= 0) {
    return 'on-track';
  }

  // Used entire budget before period ends
  if (spent === budget && daysElapsed < totalDays) {
    return 'over-budget';
  }

  const expectedDailyRate = budget / totalDays;
  const actualDailyRate = spent / daysElapsed;
  const ratio = actualDailyRate / expectedDailyRate;

  if (ratio <= 1.0) {
    return 'on-track';
  }
  if (ratio <= 1.2) {
    return 'at-risk';
  }
  return 'over-budget';
}

/**
 * Compare two period values and return the percentage change and direction.
 *
 * When the previous value was zero and the current value is non-zero, growth
 * has no meaningful percentage baseline (a jump from $0 to $500 and from $0 to
 * $5 would both be "+100%"). Such results are flagged with `isNew` and report a
 * `change` of 0 so callers can render an honest "new" state or an absolute
 * delta instead of a misleading capped percentage.
 *
 * @param current - Current period value (cents or any numeric).
 * @param previous - Previous period value (cents or any numeric).
 * @returns Object with `change` (percentage), `direction`, and optional `isNew`.
 */
export function comparePeriods(current: number, previous: number): PeriodComparison {
  if (previous === 0 && current === 0) {
    return { change: 0, direction: 'flat' };
  }
  if (previous === 0) {
    return { change: 0, direction: current > 0 ? 'up' : 'down', isNew: true };
  }

  const change = Math.round(((current - previous) / Math.abs(previous)) * 100);

  if (change === 0) {
    return { change: 0, direction: 'flat' };
  }

  return {
    change: Math.abs(change),
    direction: change > 0 ? 'up' : 'down',
  };
}

/**
 * Build category trend data by comparing current and previous period spending.
 *
 * Returns the top N categories sorted by current period spending (descending).
 *
 * @param currentByCategory - Map of category name → spending in current period (cents).
 * @param previousByCategory - Map of category name → spending in previous period (cents).
 * @param topN - Number of categories to return (default: 5).
 * @returns Sorted array of category trends.
 */
export function buildCategoryTrends(
  currentByCategory: ReadonlyMap<string, number>,
  previousByCategory: ReadonlyMap<string, number>,
  topN: number = 5,
): CategoryTrend[] {
  const trends: CategoryTrend[] = [];

  for (const [name, current] of currentByCategory) {
    const previous = previousByCategory.get(name) ?? 0;
    const comparison = comparePeriods(current, previous);
    trends.push({
      name,
      current,
      previous,
      change: comparison.change,
      direction: comparison.direction,
      ...(comparison.isNew ? { isNew: true } : {}),
    });
  }

  // Sort by current spending descending, take top N
  trends.sort((a, b) => b.current - a.current);
  return trends.slice(0, topN);
}

/**
 * Project each category's end-of-period spend from its current pace and flag the
 * ones on track to exceed their budget. Only categories with a positive budget
 * that are projected to overspend are returned, keyed by category name, so the
 * UI can surface an early "on pace to overspend by $X" warning before the
 * category is actually blown.
 *
 * @param categories - Per-category spent-so-far and budget amounts (cents).
 * @param daysElapsed - Days elapsed in the current period.
 * @param totalDays - Total days in the current period.
 * @returns Map of category name → projection, for projected-over categories only.
 */
export function projectCategoryOverspend(
  categories: readonly CategoryProjectionInput[],
  daysElapsed: number,
  totalDays: number,
): Map<string, CategoryProjection> {
  const projections = new Map<string, CategoryProjection>();
  for (const category of categories) {
    if (category.budgetCents <= 0) continue;
    const projectedCents = calculateSpendingTrajectory(category.spentCents, daysElapsed, totalDays);
    if (projectedCents <= category.budgetCents) continue;
    projections.set(category.name, {
      name: category.name,
      projectedCents,
      budgetCents: category.budgetCents,
      overspendCents: projectedCents - category.budgetCents,
    });
  }
  return projections;
}
