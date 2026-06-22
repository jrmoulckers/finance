// SPDX-License-Identifier: BUSL-1.1

/**
 * Types for grouping gig-platform payouts (Uber, DoorDash, Instacart, Lyft,
 * Grubhub, ...) out of the cash-flow income stream.
 *
 * All monetary values are integer cents (never floats) to match the rest of
 * the financial-modeling stack.
 *
 * References: issue #2133
 */

/** Which transaction field a mapping rule matches against. */
export type GigMatchField = 'payee' | 'description' | 'account' | 'any';

/**
 * A user-defined (or built-in) rule that maps an income transaction to a gig
 * platform by case-insensitive keyword/substring matching.
 */
export interface GigPlatformRule {
  /** Stable identifier. */
  readonly id: string;
  /** Display name of the platform this rule maps to (e.g. "Uber"). */
  readonly platform: string;
  /** Transaction field the keywords are matched against. */
  readonly matchField: GigMatchField;
  /** Case-insensitive substrings; a rule fires if ANY keyword is contained. */
  readonly keywords: readonly string[];
  /** Whether the rule participates in matching. */
  readonly enabled: boolean;
  /** Built-in defaults shipped with the app (vs. user-created). */
  readonly isBuiltIn: boolean;
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
}

/** The three rolling periods earnings are bucketed into. */
export type GigPeriodKey = 'today' | 'week' | 'month';

/** A value measured across all three periods. */
export interface GigPeriodAmounts {
  /** Value for the current day (in cents, or a count). */
  readonly today: number;
  /** Value for the current week (in cents, or a count). */
  readonly week: number;
  /** Value for the current month (in cents, or a count). */
  readonly month: number;
}

/** Aggregated earnings for a single platform across the three periods. */
export interface PlatformEarnings {
  /** Platform display name; unmapped income is grouped under "Other". */
  readonly platform: string;
  /** Earnings (income) totals in cents per period. */
  readonly amounts: GigPeriodAmounts;
  /** Number of income transactions per period. */
  readonly counts: GigPeriodAmounts;
}

/** Full result of {@link computePlatformEarnings}. */
export interface PlatformEarningsResult {
  /** Per-platform breakdown, sorted by month earnings descending. */
  readonly platforms: readonly PlatformEarnings[];
  /** Combined (cross-platform) earnings totals in cents per period. */
  readonly combined: GigPeriodAmounts;
  /** Combined (cross-platform) transaction counts per period. */
  readonly combinedCounts: GigPeriodAmounts;
}

/** Options controlling period bucketing for {@link computePlatformEarnings}. */
export interface PlatformEarningsOptions {
  /** Reference "now" used to compute today/week/month. Defaults to current time. */
  readonly referenceDate?: Date;
  /** Day the week starts on (0 = Sunday, 1 = Monday). Defaults to Monday. */
  readonly weekStartsOn?: 0 | 1;
  /** Map of accountId → account name, for "account"/"any" field matching. */
  readonly accountNames?: ReadonlyMap<string, string>;
}

/** A user-entered expected payout for a platform (in cents). */
export interface ExpectedPayout {
  readonly platform: string;
  /** Expected payout amount in cents. */
  readonly expectedCents: number;
}

/** Outcome of reconciling expected payouts against received deposits. */
export type ReconciliationStatus = 'matched' | 'over' | 'under' | 'pending';

/** Reconciliation of expected vs. received payout for one platform. */
export interface PlatformReconciliation {
  readonly platform: string;
  /** Expected payout in cents. */
  readonly expectedCents: number;
  /** Received deposits in cents for the period under review. */
  readonly receivedCents: number;
  /** received − expected, in cents (positive means more than expected). */
  readonly varianceCents: number;
  /** Reconciliation status. */
  readonly status: ReconciliationStatus;
}

/** Options for {@link reconcilePlatformPayouts}. */
export interface ReconciliationOptions {
  /** Period whose received amount is compared against the expected payout. */
  readonly period?: GigPeriodKey;
  /** Absolute cents tolerance treated as a match (e.g. rounding noise). */
  readonly toleranceCents?: number;
}

/** Label used for income that does not map to any gig platform. */
export const OTHER_PLATFORM_LABEL = 'Other';
