// SPDX-License-Identifier: BUSL-1.1

/**
 * Advanced budgeting types for envelope budgeting, sinking funds,
 * flex budgets, paycheck periods, templates, and budget history.
 *
 * All monetary values are integer cents to avoid floating-point errors.
 *
 * References: #1559, #1560, #1561, #1562, #1563, #1565, #1568, #1570
 */

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

/** Unique identifier for budget entities. */
export type BudgetId = string;

/** ISO 8601 date string (YYYY-MM-DD). */
export type ISODateString = string;

/** Month identifier (YYYY-MM). */
export type MonthKey = string;

// ---------------------------------------------------------------------------
// Envelope Budgeting (#1559)
// ---------------------------------------------------------------------------

/** A single envelope holding allocated funds. */
export interface Envelope {
  /** Unique identifier. */
  readonly id: BudgetId;
  /** Display name (e.g. "Groceries", "Rent"). */
  readonly name: string;
  /** Amount budgeted this period in cents. */
  readonly budgetedCents: number;
  /** Amount spent this period in cents. */
  readonly spentCents: number;
  /** Carry-over from previous periods in cents. */
  readonly carryoverCents: number;
}

/** Result of an envelope budget calculation. */
export interface EnvelopeBudgetSummary {
  /** Total income available in cents. */
  readonly totalIncomeCents: number;
  /** Sum of all envelope budgeted amounts in cents. */
  readonly totalBudgetedCents: number;
  /** Amount still available to assign to envelopes in cents. */
  readonly availableToBudgetCents: number;
  /** Per-envelope details including available balance. */
  readonly envelopes: readonly EnvelopeDetail[];
}

/** Computed detail for a single envelope. */
export interface EnvelopeDetail {
  /** Envelope identifier. */
  readonly id: BudgetId;
  /** Display name. */
  readonly name: string;
  /** Amount budgeted in cents. */
  readonly budgetedCents: number;
  /** Amount spent in cents. */
  readonly spentCents: number;
  /** Carry-over in cents. */
  readonly carryoverCents: number;
  /** Available balance: budgeted + carryover − spent, in cents. */
  readonly availableCents: number;
}

/** Request to move money between envelopes. */
export interface MoveMoneyRequest {
  /** Source envelope ID. */
  readonly fromEnvelopeId: BudgetId;
  /** Destination envelope ID. */
  readonly toEnvelopeId: BudgetId;
  /** Amount to move in cents (must be positive). */
  readonly amountCents: number;
}

/** Result of a move-money operation. */
export interface MoveMoneyResult {
  /** Whether the move succeeded. */
  readonly success: boolean;
  /** Error message if the move failed. */
  readonly error?: string;
  /** Updated envelopes after the move. */
  readonly envelopes: readonly Envelope[];
}

// ---------------------------------------------------------------------------
// Budget Templates (#1560)
// ---------------------------------------------------------------------------

/** A predefined budget template with category allocation percentages. */
export interface BudgetTemplate {
  /** Unique template identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Description of the budgeting philosophy. */
  readonly description: string;
  /** Category allocation rules. */
  readonly allocations: readonly TemplateAllocation[];
}

/** A single allocation rule within a template. */
export interface TemplateAllocation {
  /** Category name or group. */
  readonly categoryName: string;
  /** Percentage of income (0–100, integer). */
  readonly percentOfIncome: number;
  /** Priority tier. */
  readonly priority: TemplatePriority;
}

/** Priority tiers for template allocations. */
export enum TemplatePriority {
  NEEDS = 'NEEDS',
  WANTS = 'WANTS',
  SAVINGS = 'SAVINGS',
}

/** Result of applying a template to a given income. */
export interface TemplateApplicationResult {
  /** Template that was applied. */
  readonly templateId: string;
  /** Total income used in cents. */
  readonly incomeCents: number;
  /** Per-category computed amounts. */
  readonly allocations: readonly ComputedTemplateAllocation[];
  /** Any remainder from rounding in cents. */
  readonly remainderCents: number;
}

/** A computed allocation after applying a template to income. */
export interface ComputedTemplateAllocation {
  /** Category name. */
  readonly categoryName: string;
  /** Computed amount in cents. */
  readonly amountCents: number;
  /** Original percentage. */
  readonly percentOfIncome: number;
  /** Priority tier. */
  readonly priority: TemplatePriority;
}

// ---------------------------------------------------------------------------
// Pay-Yourself-First (#1561)
// ---------------------------------------------------------------------------

/** An automatic allocation rule for pay-yourself-first budgeting. */
export interface PayYourselfFirstRule {
  /** Unique rule identifier. */
  readonly id: BudgetId;
  /** Target category or goal name. */
  readonly targetName: string;
  /** Allocation type: fixed cents or percentage of income. */
  readonly allocationType: 'fixed' | 'percentage';
  /** Amount in cents (if fixed) or basis points (if percentage, 1% = 100). */
  readonly value: number;
  /** Priority order (lower = funded first). */
  readonly priority: number;
}

/** Result of pay-yourself-first allocation. */
export interface PayYourselfFirstResult {
  /** Total income in cents. */
  readonly incomeCents: number;
  /** Allocations funded in priority order. */
  readonly allocations: readonly PayYourselfFirstAllocation[];
  /** Remaining discretionary income in cents. */
  readonly discretionaryCents: number;
  /** Rules that could not be fully funded. */
  readonly unfundedRules: readonly PayYourselfFirstRule[];
}

/** A single funded allocation from pay-yourself-first. */
export interface PayYourselfFirstAllocation {
  /** Rule identifier. */
  readonly ruleId: BudgetId;
  /** Target name. */
  readonly targetName: string;
  /** Requested amount in cents. */
  readonly requestedCents: number;
  /** Actual funded amount in cents. */
  readonly fundedCents: number;
  /** Whether fully funded. */
  readonly fullyFunded: boolean;
}

// ---------------------------------------------------------------------------
// Sinking Funds / True Expenses (#1562)
// ---------------------------------------------------------------------------

/** Cadence for sinking fund contributions. */
export enum SinkingFundCadence {
  WEEKLY = 'WEEKLY',
  BIWEEKLY = 'BIWEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  SEMI_ANNUALLY = 'SEMI_ANNUALLY',
  ANNUALLY = 'ANNUALLY',
}

/** A sinking fund target for a true expense. */
export interface SinkingFund {
  /** Unique identifier. */
  readonly id: BudgetId;
  /** Display name (e.g. "Car Insurance", "Christmas Gifts"). */
  readonly name: string;
  /** Total target amount in cents. */
  readonly targetCents: number;
  /** Amount already saved in cents. */
  readonly savedCents: number;
  /** Due date (ISO 8601). */
  readonly dueDate: ISODateString;
  /** How often contributions are made. */
  readonly cadence: SinkingFundCadence;
}

/** Computed contribution schedule for a sinking fund. */
export interface SinkingFundSchedule {
  /** Fund identifier. */
  readonly fundId: BudgetId;
  /** Fund name. */
  readonly name: string;
  /** Amount still needed in cents. */
  readonly remainingCents: number;
  /** Number of contribution periods until due date. */
  readonly periodsRemaining: number;
  /** Required contribution per period in cents. */
  readonly contributionPerPeriodCents: number;
  /** Whether the fund is on track (saved >= expected at this point). */
  readonly onTrack: boolean;
  /** Expected amount saved by now in cents. */
  readonly expectedSavedCents: number;
}

// ---------------------------------------------------------------------------
// Flex Budgeting (#1563)
// ---------------------------------------------------------------------------

/** Type of flex budget bucket. */
export enum FlexBucketType {
  /** Fixed expense — same amount every period (e.g. rent). */
  FIXED = 'FIXED',
  /** Non-monthly expense — occurs on a different cadence. */
  NON_MONTHLY = 'NON_MONTHLY',
  /** Flexible expense — amount varies, has a target. */
  FLEXIBLE = 'FLEXIBLE',
}

/** A flex budget bucket. */
export interface FlexBucket {
  /** Unique identifier. */
  readonly id: BudgetId;
  /** Display name. */
  readonly name: string;
  /** Bucket type. */
  readonly type: FlexBucketType;
  /** Target amount per period in cents. */
  readonly targetCents: number;
  /** Actual spending this period in cents. */
  readonly spentCents: number;
  /** Rollover balance from prior periods in cents. */
  readonly rolloverCents: number;
}

/** Summary of a flex budget. */
export interface FlexBudgetSummary {
  /** Total income in cents. */
  readonly incomeCents: number;
  /** Sum of fixed bucket targets in cents. */
  readonly totalFixedCents: number;
  /** Sum of non-monthly bucket targets in cents. */
  readonly totalNonMonthlyCents: number;
  /** Amount available for flexible spending in cents. */
  readonly flexibleAvailableCents: number;
  /** Per-bucket details. */
  readonly buckets: readonly FlexBucketDetail[];
}

/** Computed detail for a flex bucket. */
export interface FlexBucketDetail {
  /** Bucket identifier. */
  readonly id: BudgetId;
  /** Display name. */
  readonly name: string;
  /** Bucket type. */
  readonly type: FlexBucketType;
  /** Target in cents. */
  readonly targetCents: number;
  /** Spent in cents. */
  readonly spentCents: number;
  /** Rollover in cents. */
  readonly rolloverCents: number;
  /** Available: target + rollover − spent, in cents. */
  readonly availableCents: number;
}

// ---------------------------------------------------------------------------
// Paycheck Periods (#1565)
// ---------------------------------------------------------------------------

/** Pay frequency for paycheck-aligned budgets. */
export enum PayFrequency {
  WEEKLY = 'WEEKLY',
  BIWEEKLY = 'BIWEEKLY',
  SEMI_MONTHLY = 'SEMI_MONTHLY',
  MONTHLY = 'MONTHLY',
}

/** Configuration for paycheck-aligned budget periods. */
export interface PaycheckConfig {
  /** Pay frequency. */
  readonly frequency: PayFrequency;
  /** First pay date (ISO 8601). Used as anchor for period calculations. */
  readonly firstPayDate: ISODateString;
  /** For SEMI_MONTHLY: second pay day of month (e.g. 15). */
  readonly secondPayDay?: number;
}

/** A single paycheck-aligned budget period. */
export interface PaycheckPeriod {
  /** Period start date (inclusive, ISO 8601). */
  readonly startDate: ISODateString;
  /** Period end date (inclusive, ISO 8601). */
  readonly endDate: ISODateString;
  /** Number of days in this period. */
  readonly days: number;
  /** Label for display (e.g. "May 1 – May 14"). */
  readonly label: string;
}

// ---------------------------------------------------------------------------
// Month-Ahead Buffer (#1568)
// ---------------------------------------------------------------------------

/** Configuration for the month-ahead buffer goal. */
export interface MonthAheadBufferConfig {
  /** Target buffer amount in cents (typically one month of expenses). */
  readonly targetCents: number;
  /** Current buffer savings in cents. */
  readonly currentCents: number;
  /** Monthly contribution toward the buffer in cents. */
  readonly monthlyContributionCents: number;
}

/** Progress report for the month-ahead buffer goal. */
export interface MonthAheadBufferProgress {
  /** Target buffer in cents. */
  readonly targetCents: number;
  /** Current savings in cents. */
  readonly currentCents: number;
  /** Amount remaining in cents. */
  readonly remainingCents: number;
  /** Progress as a percentage (0–100). */
  readonly progressPercent: number;
  /** Whether the goal is complete. */
  readonly isComplete: boolean;
  /** Estimated months to completion (null if already complete or no contribution). */
  readonly estimatedMonthsToCompletion: number | null;
  /** Projected completion date (ISO 8601, null if already complete or no contribution). */
  readonly projectedCompletionDate: ISODateString | null;
}

// ---------------------------------------------------------------------------
// Budget History (#1570)
// ---------------------------------------------------------------------------

/** A snapshot of budget allocations for a single period. */
export interface BudgetPeriodSnapshot {
  /** Period identifier (e.g. "2025-05" or paycheck period label). */
  readonly periodKey: string;
  /** Individual allocations for this period. */
  readonly allocations: readonly BudgetHistoryAllocation[];
  /** Total budgeted across all categories in cents. */
  readonly totalBudgetedCents: number;
}

/** A single allocation within a budget period snapshot. */
export interface BudgetHistoryAllocation {
  /** Category identifier. */
  readonly categoryId: string;
  /** Category name. */
  readonly name: string;
  /** Amount budgeted in cents. */
  readonly budgetedCents: number;
  /** Amount spent in cents. */
  readonly spentCents: number;
}

/** Diff between two budget period snapshots. */
export interface BudgetPeriodDiff {
  /** Source period key. */
  readonly fromPeriodKey: string;
  /** Target period key. */
  readonly toPeriodKey: string;
  /** Per-category diffs. */
  readonly diffs: readonly BudgetAllocationDiff[];
  /** Net change in total budgeted in cents. */
  readonly totalBudgetedChangeCents: number;
}

/** Diff for a single category between two periods. */
export interface BudgetAllocationDiff {
  /** Category identifier. */
  readonly categoryId: string;
  /** Category name. */
  readonly name: string;
  /** Amount in the source period in cents. */
  readonly fromBudgetedCents: number;
  /** Amount in the target period in cents. */
  readonly toBudgetedCents: number;
  /** Change in cents (to − from). */
  readonly changeCents: number;
  /** Whether this category is new in the target period. */
  readonly isNew: boolean;
  /** Whether this category was removed in the target period. */
  readonly isRemoved: boolean;
}
