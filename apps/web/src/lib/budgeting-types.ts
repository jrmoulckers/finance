// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared types for all budgeting calculation engines.
 *
 * All monetary values are represented as integer cents to avoid
 * floating-point errors inherent in IEEE 754 arithmetic.
 *
 * References: issues #1558, #1566, #1567, #1755
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Available budgeting strategy modes. */
export enum BudgetingMode {
  /** Classic envelope-style budgeting with fixed category allocations. */
  TRADITIONAL = 'TRADITIONAL',
  /** Every dollar is assigned a job — income minus allocations must equal zero. */
  ZERO_BASED = 'ZERO_BASED',
  /** Designed for irregular/freelance income with averaging and buffer tracking. */
  VARIABLE_INCOME = 'VARIABLE_INCOME',
}

/** Priority tier for adaptive budget allocation. */
export enum AllocationPriority {
  /** Must-pay obligations (rent, utilities, debt minimums). */
  ESSENTIAL = 'ESSENTIAL',
  /** Important but deferrable (groceries, insurance). */
  IMPORTANT = 'IMPORTANT',
  /** Nice-to-have spending (dining out, entertainment). */
  DISCRETIONARY = 'DISCRETIONARY',
  /** Savings and investment contributions. */
  SAVINGS = 'SAVINGS',
}

// ---------------------------------------------------------------------------
// Income
// ---------------------------------------------------------------------------

/** A single income event. */
export interface IncomeRecord {
  /** Unique identifier. */
  readonly id: string;
  /** Income amount in cents. */
  readonly amountCents: number;
  /** Source description (e.g. "Salary", "Freelance"). */
  readonly source: string;
  /** ISO 8601 date string (YYYY-MM-DD). */
  readonly date: string;
}

// ---------------------------------------------------------------------------
// Budget allocations
// ---------------------------------------------------------------------------

/** A single category allocation within a budget. */
export interface BudgetAllocation {
  /** Category identifier. */
  readonly categoryId: string;
  /** Display name. */
  readonly name: string;
  /** Amount allocated in cents. */
  readonly allocatedCents: number;
  /** Amount spent so far in cents. */
  readonly spentCents: number;
}

// ---------------------------------------------------------------------------
// Zero-based budgeting
// ---------------------------------------------------------------------------

/** Allocation status for zero-based budgeting. */
export type ZeroBasedStatus = 'fully-allocated' | 'under-allocated' | 'over-allocated';

/** Full summary of a zero-based budget. */
export interface ZeroBasedSummary {
  /** Total income available in cents. */
  readonly totalIncomeCents: number;
  /** Total allocated across all categories in cents. */
  readonly totalAllocatedCents: number;
  /** Income minus allocated — the amount still assignable (may be negative). */
  readonly readyToAssignCents: number;
  /** Whether the budget is balanced, under, or over. */
  readonly status: ZeroBasedStatus;
  /** Individual category allocations. */
  readonly allocations: readonly BudgetAllocation[];
}

// ---------------------------------------------------------------------------
// Variable-income analysis
// ---------------------------------------------------------------------------

/** Statistical analysis of variable income history. */
export interface VariableIncomeAnalysis {
  /** Arithmetic mean income in cents. */
  readonly averageCents: number;
  /** Median income in cents. */
  readonly medianCents: number;
  /** Minimum income observed in cents. */
  readonly minCents: number;
  /** Maximum income observed in cents. */
  readonly maxCents: number;
  /** Population standard deviation in cents. */
  readonly stdDevCents: number;
  /** Coefficient of variation as a percentage (stdDev / mean × 100). */
  readonly variabilityPercent: number;
  /** How many months of expenses the savings buffer covers (floored). */
  readonly bufferMonths: number;
  /** Conservative budget recommendation in cents (mean minus one stdDev, floored to 0). */
  readonly conservativeBudgetCents: number;
}

// ---------------------------------------------------------------------------
// Adaptive starter budgets
// ---------------------------------------------------------------------------

/** Raw spending data for a single category in a single month. */
export interface MonthlyCategorySpending {
  /** Category identifier. */
  readonly categoryId: string;
  /** Display name. */
  readonly name: string;
  /** Month identifier (YYYY-MM). */
  readonly month: string;
  /** Amount spent in cents. */
  readonly amountCents: number;
}

/** A per-category budget suggestion derived from spending history. */
export interface CategorySuggestion {
  /** Category identifier. */
  readonly categoryId: string;
  /** Display name. */
  readonly name: string;
  /** Suggested monthly budget in cents (historical average). */
  readonly suggestedCents: number;
  /** User-adjusted amount in cents (defaults to suggestedCents). */
  readonly adjustedCents: number;
  /** Minimum observed monthly spending in cents. */
  readonly minCents: number;
  /** Maximum observed monthly spending in cents. */
  readonly maxCents: number;
  /** How many months had data for this category. */
  readonly monthsWithData: number;
}

/** Result of analysing spending history for starter budgets. */
export interface SpendingAnalysisResult {
  /** Per-category suggestions sorted by suggestedCents descending. */
  readonly suggestions: readonly CategorySuggestion[];
  /** Sum of all suggestedCents. */
  readonly totalSuggestedCents: number;
  /** Sum of all adjustedCents. */
  readonly totalAdjustedCents: number;
  /** Number of distinct months analysed. */
  readonly monthsAnalysed: number;
}

// ---------------------------------------------------------------------------
// Adaptive priority-based allocation
// ---------------------------------------------------------------------------

/** A category with its priority tier for adaptive allocation. */
export interface PrioritisedCategory {
  /** Category identifier. */
  readonly categoryId: string;
  /** Display name. */
  readonly name: string;
  /** Requested allocation in cents. */
  readonly requestedCents: number;
  /** Priority tier determining funding order. */
  readonly priority: AllocationPriority;
}

/** Result of priority-based allocation for a single category. */
export interface PriorityAllocationResult {
  /** Category identifier. */
  readonly categoryId: string;
  /** Display name. */
  readonly name: string;
  /** Amount actually funded in cents. */
  readonly fundedCents: number;
  /** Original requested amount in cents. */
  readonly requestedCents: number;
  /** Whether this category was fully funded. */
  readonly fullyFunded: boolean;
  /** Priority tier. */
  readonly priority: AllocationPriority;
}

/** Income prediction with confidence. */
export interface IncomePrediction {
  /** Predicted income in cents. */
  readonly predictedCents: number;
  /** Confidence score from 0 to 1. */
  readonly confidence: number;
  /** Number of data points used. */
  readonly dataPoints: number;
}

/** Full scenario analysis result. */
export interface ScenarioResult {
  /** Total income for the scenario in cents. */
  readonly incomeCents: number;
  /** Per-category allocation results. */
  readonly allocations: readonly PriorityAllocationResult[];
  /** Total funded across all categories in cents. */
  readonly totalFundedCents: number;
  /** Remaining unallocated income in cents. */
  readonly surplusCents: number;
  /** Categories that were not fully funded. */
  readonly underfunded: readonly PriorityAllocationResult[];
}

/** Rollover result carrying surplus from a prior period. */
export interface RolloverResult {
  /** Category identifier. */
  readonly categoryId: string;
  /** Prior period allocation in cents. */
  readonly priorAllocatedCents: number;
  /** Unused (surplus) amount in cents from prior period. */
  readonly unusedCents: number;
  /** New allocation after rollover in cents. */
  readonly rolledOverCents: number;
}
