// SPDX-License-Identifier: BUSL-1.1

/**
 * Public barrel for the trip / country budget engine (issue #2205).
 *
 * This barrel exports only the pure engine and its types. It is imported
 * directly by `TripBudgetsPage` (a lazily code-split route) and never pulled
 * into a shared, eagerly-loaded barrel — keeping the page within the per-chunk
 * gzip performance budget.
 */

export * from './trip-budgets';
export type {
  TripBudget,
  TripBudgetReport,
  TripBudgetStatus,
  TripBudgetTotals,
  TripTotalsOptions,
  TripTransaction,
} from './types';
