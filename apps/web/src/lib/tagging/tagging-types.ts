// SPDX-License-Identifier: BUSL-1.1

/**
 * Type definitions for the auto-tagging system.
 *
 * Defines the core data structures for user-defined tagging rules
 * (Phase 1) and pattern-based tag suggestions (Phase 2).
 *
 * @module lib/tagging/tagging-types
 * References: issue #1473
 */

// ---------------------------------------------------------------------------
// Phase 1: Rule-based auto-tagging
// ---------------------------------------------------------------------------

/**
 * Fields on a transaction that can be matched by a tagging rule condition.
 *
 * - `counterpartyName` maps to `Transaction.payee`
 * - `description` maps to `Transaction.note`
 * - `amount` matches against `Transaction.amount.amount` (in cents)
 * - `type` matches against `Transaction.type`
 * - `category` matches against `Transaction.categoryId`
 * - `account` matches against `Transaction.accountId`
 */
export type TagConditionField =
  | 'counterpartyName'
  | 'category'
  | 'amount'
  | 'account'
  | 'description'
  | 'type';

/**
 * Comparison operators available for tag rule conditions.
 *
 * - `matches` uses a regular expression (validated before storage)
 * - `between` requires both `value` and `value2`
 */
export type TagConditionOperator =
  | 'contains'
  | 'equals'
  | 'startsWith'
  | 'endsWith'
  | 'greaterThan'
  | 'lessThan'
  | 'between'
  | 'matches';

/** A single condition within a tagging rule (AND logic between conditions). */
export interface TagCondition {
  /** The transaction field to evaluate. */
  readonly field: TagConditionField;
  /** The comparison operator. */
  readonly operator: TagConditionOperator;
  /** The comparison value (string representation; numeric for amount ops). */
  readonly value: string;
  /** Second value for the `between` operator (inclusive upper bound). */
  readonly value2?: string;
}

/** The type of action a tagging rule can perform when matched. */
export type TagActionType = 'addTag' | 'setCategory';

/** An action to perform when a tagging rule matches a transaction. */
export interface TagAction {
  /** Whether to add a tag or set a category. */
  readonly type: TagActionType;
  /** The tag name (for `addTag`) or category name (for `setCategory`). */
  readonly value: string;
}

/**
 * A user-defined tagging rule that automatically applies tags and/or
 * categories to transactions matching its conditions.
 *
 * Rules are evaluated in priority order (higher = evaluated first).
 * All conditions within a rule must match (AND logic). Multiple
 * matching rules contribute their actions (union of tags).
 */
export interface TaggingRule {
  /** Unique identifier (UUID). */
  readonly id: string;
  /** User-friendly name, e.g. "Coffee shops". */
  readonly name: string;
  /** Whether this rule is active. Disabled rules are skipped. */
  readonly enabled: boolean;
  /** Conditions that must ALL match for the rule to fire (AND logic). */
  readonly conditions: readonly TagCondition[];
  /** Actions to perform when the rule matches. */
  readonly actions: readonly TagAction[];
  /** Higher priority rules are evaluated first. */
  readonly priority: number;
  /** ISO-8601 timestamp when the rule was created. */
  readonly createdAt: string;
  /** Number of transactions this rule has matched (lifetime). */
  readonly matchCount: number;
}

// ---------------------------------------------------------------------------
// Phase 2: Pattern learning
// ---------------------------------------------------------------------------

/** A tag with its frequency count within a pattern. */
export interface TagFrequency {
  /** The tag name. */
  readonly name: string;
  /** How many times this tag has been applied in the pattern's context. */
  readonly count: number;
}

/**
 * A learned tagging pattern based on a counterparty (payee).
 *
 * Tracks which tags users manually apply to transactions from a
 * specific counterparty, building a frequency map that powers
 * tag suggestions.
 */
export interface TaggingPattern {
  /** The normalised counterparty name (lowercase, trimmed). */
  readonly counterpartyName: string;
  /** Tags applied to transactions from this counterparty, with counts. */
  readonly tags: readonly TagFrequency[];
  /** Total number of transactions from this counterparty that were tagged. */
  readonly totalTagged: number;
  /** ISO-8601 timestamp of the last update to this pattern. */
  readonly lastUpdated: string;
}

/** A suggested tag with a confidence score. */
export interface TagSuggestion {
  /** The suggested tag name. */
  readonly tag: string;
  /** Confidence score from 0 to 1. */
  readonly confidence: number;
  /** Human-readable reason for the suggestion. */
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** User settings for auto-tagging features. */
export interface AutoTaggingSettings {
  /** Whether rule-based auto-tagging is enabled. */
  readonly rulesEnabled: boolean;
  /** Whether pattern-based tag suggestions are shown. */
  readonly suggestionsEnabled: boolean;
}

/** Default auto-tagging settings (all disabled until user opts in). */
export const DEFAULT_AUTO_TAGGING_SETTINGS: AutoTaggingSettings = {
  rulesEnabled: false,
  suggestionsEnabled: false,
};
