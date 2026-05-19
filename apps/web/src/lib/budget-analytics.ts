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
 * @param current - Current period value (cents or any numeric).
 * @param previous - Previous period value (cents or any numeric).
 * @returns Object with `change` (percentage) and `direction`.
 */
export function comparePeriods(current: number, previous: number): PeriodComparison {
  if (previous === 0 && current === 0) {
    return { change: 0, direction: 'flat' };
  }
  if (previous === 0) {
    return { change: 100, direction: 'up' };
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
    });
  }

  // Sort by current spending descending, take top N
  trends.sort((a, b) => b.current - a.current);
  return trends.slice(0, topN);
}
