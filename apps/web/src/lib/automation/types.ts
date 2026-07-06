// SPDX-License-Identifier: BUSL-1.1

/**
 * Type definitions for the financial automation rule engine.
 *
 * All monetary values are in integer cents to avoid floating-point errors.
 * Pattern matching supports substring, regex, and starts-with modes.
 *
 * Reference: issue #1614
 */

// ---------------------------------------------------------------------------
// Transaction (input to the rule engine)
// ---------------------------------------------------------------------------

/** A financial transaction as seen by the rule engine. */
export interface Transaction {
  /** Unique identifier. */
  readonly id: string;
  /** Amount in cents (positive = income, negative = expense). */
  readonly amountCents: number;
  /** Category identifier, if assigned. */
  readonly categoryId: string | null;
  /** Category name for display / matching. */
  readonly categoryName: string | null;
  /** Merchant or payee name. */
  readonly merchantName: string | null;
  /** ISO 8601 date string (YYYY-MM-DD). */
  readonly date: string;
  /** Whether this transaction recurs on a schedule. */
  readonly isRecurring: boolean;
  /** Account identifier. */
  readonly accountId: string;
  /** Account name for display / matching. */
  readonly accountName: string | null;
  /** User-assigned tags. */
  readonly tags: readonly string[];
  /** Free-form note / memo. */
  readonly note: string | null;
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

/** Comparison operators for numeric conditions. */
export type AmountOperator =
  'greater_than' | 'less_than' | 'equal' | 'greater_or_equal' | 'less_or_equal' | 'between';

/** Pattern matching mode for string conditions. */
export type PatternMode = 'substring' | 'regex' | 'starts_with' | 'exact';

/** A condition that tests a transaction's amount in cents. */
export interface AmountCondition {
  readonly type: 'amount';
  readonly operator: AmountOperator;
  /** Primary threshold in cents. */
  readonly valueCents: number;
  /** Upper bound for 'between' operator (inclusive), in cents. */
  readonly upperBoundCents?: number;
}

/** A condition that matches a category name or id. */
export interface CategoryCondition {
  readonly type: 'category';
  readonly pattern: string;
  readonly mode: PatternMode;
}

/** A condition that matches a merchant / payee name. */
export interface MerchantCondition {
  readonly type: 'merchant';
  readonly pattern: string;
  readonly mode: PatternMode;
}

/** A condition that checks whether a transaction falls within a date range. */
export interface DateRangeCondition {
  readonly type: 'date_range';
  /** Inclusive start date (ISO 8601). */
  readonly startDate: string;
  /** Inclusive end date (ISO 8601). */
  readonly endDate: string;
}

/** A condition that checks the recurring flag. */
export interface RecurringCondition {
  readonly type: 'recurring';
  /** Whether the transaction must be recurring (true) or non-recurring (false). */
  readonly isRecurring: boolean;
}

/** A condition that matches an account by name or id. */
export interface AccountCondition {
  readonly type: 'account';
  readonly pattern: string;
  readonly mode: PatternMode;
}

/** Union of all leaf condition types. */
export type LeafCondition =
  | AmountCondition
  | CategoryCondition
  | MerchantCondition
  | DateRangeCondition
  | RecurringCondition
  | AccountCondition;

/** Compound condition combining children with AND / OR / NOT. */
export interface CompoundCondition {
  readonly type: 'and' | 'or' | 'not';
  readonly children: readonly RuleCondition[];
}

/** Any condition — either a leaf or a compound. */
export type RuleCondition = LeafCondition | CompoundCondition;

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Set the transaction's category. */
export interface CategorizeAction {
  readonly type: 'categorize';
  readonly categoryId: string;
  readonly categoryName: string;
}

/** Add a tag to the transaction. */
export interface AddTagAction {
  readonly type: 'add_tag';
  readonly tag: string;
}

/**
 * Split the transaction into multiple parts.
 *
 * Each split specifies a ratio (integer weight) or a fixed amount in cents.
 * The engine ensures the parts sum exactly to the original amount using
 * Banker's rounding with remainder distribution.
 */
export interface SplitTransactionAction {
  readonly type: 'split_transaction';
  readonly splits: readonly SplitPart[];
}

/** One part of a split transaction. */
export interface SplitPart {
  /** Human-readable label (e.g. "Rent — Alice", "Rent — Bob"). */
  readonly label: string;
  /** Integer weight for ratio-based splitting. */
  readonly ratio?: number;
  /** Fixed amount in cents (takes precedence over ratio when set). */
  readonly fixedCents?: number;
  /** Target category, if different from the original. */
  readonly categoryId?: string;
}

/** Assign the transaction to a budget envelope. */
export interface MoveToBudgetAction {
  readonly type: 'move_to_budget';
  readonly budgetId: string;
  readonly budgetName: string;
}

/** Flag the transaction for manual review. */
export interface FlagForReviewAction {
  readonly type: 'flag_for_review';
  readonly reason: string;
}

/** Queue a notification for the user. */
export interface SendNotificationAction {
  readonly type: 'send_notification';
  readonly title: string;
  readonly body: string;
}

/** Union of all action types. */
export type RuleAction =
  | CategorizeAction
  | AddTagAction
  | SplitTransactionAction
  | MoveToBudgetAction
  | FlagForReviewAction
  | SendNotificationAction;

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

/** When a rule should be evaluated. */
export type RuleTrigger = 'on_import' | 'on_save' | 'scheduled' | 'manual';

// ---------------------------------------------------------------------------
// Rule
// ---------------------------------------------------------------------------

/** Priority weight — lower numbers run first. */
export type RulePriority = number;

/** A complete automation rule. */
export interface Rule {
  /** Unique identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Optional description. */
  readonly description?: string;
  /** Whether this rule is currently active. */
  readonly enabled: boolean;
  /** When this rule should fire. */
  readonly trigger: RuleTrigger;
  /** Lower numbers evaluate first. */
  readonly priority: RulePriority;
  /** Root condition tree — must evaluate to true for actions to fire. */
  readonly condition: RuleCondition;
  /** Ordered list of actions to execute when the condition matches. */
  readonly actions: readonly RuleAction[];
  /** ISO 8601 datetime of creation. */
  readonly createdAt: string;
  /** ISO 8601 datetime of last update. */
  readonly updatedAt: string;
}

// ---------------------------------------------------------------------------
// Mutations & execution results
// ---------------------------------------------------------------------------

/** A proposed change to a transaction produced by an action. */
export interface TransactionMutation {
  /** Which action produced this mutation. */
  readonly sourceActionType: RuleAction['type'];
  /** The rule that triggered this mutation. */
  readonly sourceRuleId: string;
  /** Field-level changes to apply. */
  readonly changes: Readonly<TransactionChanges>;
}

/** Possible field-level changes to a transaction. */
export interface TransactionChanges {
  readonly categoryId?: string;
  readonly categoryName?: string;
  readonly tags?: readonly string[];
  readonly budgetId?: string;
  readonly budgetName?: string;
  readonly flaggedForReview?: boolean;
  readonly flagReason?: string;
  readonly notification?: { readonly title: string; readonly body: string };
  /**
   * For split actions — the list of child transactions to create.
   * Each child carries its own amount in cents.
   */
  readonly splitChildren?: readonly SplitChild[];
}

/** A child record produced by a split action. */
export interface SplitChild {
  readonly label: string;
  readonly amountCents: number;
  readonly categoryId?: string;
}

/** The result of evaluating a single rule against a transaction. */
export interface RuleEvaluationResult {
  readonly rule: Rule;
  readonly matched: boolean;
  readonly mutations: readonly TransactionMutation[];
}

/** The result of running the full engine against a transaction. */
export interface RuleExecutionResult {
  readonly transaction: Transaction;
  readonly evaluatedRules: readonly RuleEvaluationResult[];
  readonly mutations: readonly TransactionMutation[];
  readonly dryRun: boolean;
}

// ---------------------------------------------------------------------------
// Conflict resolution
// ---------------------------------------------------------------------------

/** Strategy for resolving multiple matching rules. */
export type ConflictResolution = 'first_match' | 'all_matching' | 'priority_ordered';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Severity level for validation diagnostics. */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/** A single validation diagnostic. */
export interface ValidationDiagnostic {
  readonly severity: ValidationSeverity;
  readonly ruleId: string;
  readonly message: string;
  readonly code: string;
}

/** Result of validating a rule set. */
export interface ValidationResult {
  readonly valid: boolean;
  readonly diagnostics: readonly ValidationDiagnostic[];
}
