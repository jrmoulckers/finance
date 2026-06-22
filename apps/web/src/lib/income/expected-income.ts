// SPDX-License-Identifier: BUSL-1.1

/**
 * Expected-income engine.
 *
 * Tracks money a household is *expecting* (e.g. child support that is often
 * late) separately from money that has actually *cleared*. The goal is to let
 * a user plan bills without pretending uncertain money has already arrived.
 *
 * Core principle: **spendable / realized cash never includes expected-but-not-
 * cleared income.** Expected money is reported in its own totals so the user
 * can clearly see "certain money I have now" vs "money I am only hoping for".
 *
 * All monetary values are **integer cents**. Every function here is pure and
 * deterministic — given the same items and reference date it always returns the
 * same result (no `Date.now()`, no `Math.random()`).
 *
 * Refs #2193
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Confidence that an expected payment will actually arrive. */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/** All confidence levels, ordered most → least reliable. */
export const CONFIDENCE_LEVELS: readonly ConfidenceLevel[] = Object.freeze([
  'high',
  'medium',
  'low',
]);

/**
 * Weight applied to an expected (uncleared) amount when computing the
 * confidence-weighted total. `high` counts in full; lower confidence discounts
 * the amount so planning leans conservative.
 */
export const CONFIDENCE_WEIGHTS: Readonly<Record<ConfidenceLevel, number>> = Object.freeze({
  high: 1,
  medium: 0.6,
  low: 0.3,
});

/** Human-readable label for a confidence level. */
export const CONFIDENCE_LABELS: Readonly<Record<ConfidenceLevel, string>> = Object.freeze({
  high: 'High',
  medium: 'Medium',
  low: 'Low',
});

/** A single expected-income item (e.g. one child-support payment). */
export interface ExpectedIncomeItem {
  /** Stable identifier. */
  id: string;
  /** Short description shown to the user (e.g. "Child support — June"). */
  label: string;
  /** Amount in integer cents. Should be non-negative. */
  amountCents: number;
  /** Date the money is expected, as an ISO `YYYY-MM-DD` string. */
  expectedDate: string;
  /** How reliable this payment is. */
  confidence: ConfidenceLevel;
  /** `true` once the money has actually been received / cleared. */
  cleared: boolean;
}

/** Aggregated view separating realized (certain) money from expected money. */
export interface ExpectedIncomeSummary {
  /** Total number of items. */
  totalCount: number;
  /** Number of items already cleared/received. */
  clearedCount: number;
  /** Number of items still pending (not yet cleared). */
  pendingCount: number;
  /** Number of pending items whose expected date is in the past. */
  overdueCount: number;
  /**
   * Realized cash, in cents — the sum of **cleared** items only.
   * This is the spendable-now figure; it must never include expected money.
   */
  realizedCents: number;
  /** Sum of items that are expected but **not yet cleared**, in cents. */
  expectedNotYetReceivedCents: number;
  /**
   * Confidence-weighted expected total, in cents — each pending item's amount
   * is multiplied by its confidence weight, then rounded to whole cents.
   */
  confidenceWeightedExpectedCents: number;
  /** Sum of pending items that are past their expected date, in cents. */
  overdueCents: number;
  /**
   * "Planned including expected" total, in cents — realized cash plus all
   * expected-but-uncleared money. Combines certain and uncertain money; pair it
   * with {@link realizedCents} so the user sees both sides.
   */
  plannedTotalCents: number;
  /**
   * Conservative planned total, in cents — realized cash plus the
   * confidence-weighted expected money rather than the full expected amount.
   */
  plannedConfidenceAdjustedCents: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Round half away from zero to whole cents. Deterministic — used so the
 * confidence-weighted total is stable regardless of host environment.
 */
function roundCents(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.sign(value) * Math.round(Math.abs(value));
}

/**
 * Convert an ISO `YYYY-MM-DD` date into a comparable `YYYYMMDD` integer.
 * Returns `NaN` for unparseable input so callers can treat it as "no date".
 */
function dateKey(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date.trim());
  if (!match) {
    return Number.NaN;
  }
  return Number(`${match[1]}${match[2]}${match[3]}`);
}

/** Weight for a confidence level, defaulting to `low` for unknown values. */
export function confidenceWeight(level: ConfidenceLevel): number {
  return CONFIDENCE_WEIGHTS[level] ?? CONFIDENCE_WEIGHTS.low;
}

/**
 * Whether an item is overdue relative to `referenceDate`: it is still pending
 * (not cleared) and its expected date is strictly before the reference date.
 * Items expected exactly on the reference date are **not** overdue.
 */
export function isOverdue(item: ExpectedIncomeItem, referenceDate: string): boolean {
  if (item.cleared) {
    return false;
  }
  const itemKey = dateKey(item.expectedDate);
  const refKey = dateKey(referenceDate);
  if (Number.isNaN(itemKey) || Number.isNaN(refKey)) {
    return false;
  }
  return itemKey < refKey;
}

// ---------------------------------------------------------------------------
// Main aggregation
// ---------------------------------------------------------------------------

/** A zeroed summary, returned for an empty item list. */
function emptySummary(): ExpectedIncomeSummary {
  return {
    totalCount: 0,
    clearedCount: 0,
    pendingCount: 0,
    overdueCount: 0,
    realizedCents: 0,
    expectedNotYetReceivedCents: 0,
    confidenceWeightedExpectedCents: 0,
    overdueCents: 0,
    plannedTotalCents: 0,
    plannedConfidenceAdjustedCents: 0,
  };
}

/**
 * Summarise a list of expected-income items, separating realized (cleared)
 * cash from expected (uncleared) money.
 *
 * @param items         - Expected-income items (any order).
 * @param referenceDate - ISO `YYYY-MM-DD` "today" used for overdue detection.
 * @returns A deterministic {@link ExpectedIncomeSummary}.
 */
export function summarizeExpectedIncome(
  items: readonly ExpectedIncomeItem[],
  referenceDate: string,
): ExpectedIncomeSummary {
  if (items.length === 0) {
    return emptySummary();
  }

  const summary = emptySummary();
  summary.totalCount = items.length;

  for (const item of items) {
    const amount = Number.isFinite(item.amountCents) ? Math.trunc(item.amountCents) : 0;

    if (item.cleared) {
      summary.clearedCount += 1;
      summary.realizedCents += amount;
      continue;
    }

    summary.pendingCount += 1;
    summary.expectedNotYetReceivedCents += amount;
    summary.confidenceWeightedExpectedCents += roundCents(
      amount * confidenceWeight(item.confidence),
    );

    if (isOverdue(item, referenceDate)) {
      summary.overdueCount += 1;
      summary.overdueCents += amount;
    }
  }

  summary.plannedTotalCents = summary.realizedCents + summary.expectedNotYetReceivedCents;
  summary.plannedConfidenceAdjustedCents =
    summary.realizedCents + summary.confidenceWeightedExpectedCents;

  return summary;
}

/**
 * Sort items for display: overdue first, then by soonest expected date, then by
 * label. Pure — returns a new array and never mutates the input.
 */
export function sortExpectedIncome(
  items: readonly ExpectedIncomeItem[],
  referenceDate: string,
): ExpectedIncomeItem[] {
  return [...items].sort((a, b) => {
    const aOverdue = isOverdue(a, referenceDate) ? 0 : 1;
    const bOverdue = isOverdue(b, referenceDate) ? 0 : 1;
    if (aOverdue !== bOverdue) {
      return aOverdue - bOverdue;
    }

    const aKey = dateKey(a.expectedDate);
    const bKey = dateKey(b.expectedDate);
    if (!Number.isNaN(aKey) && !Number.isNaN(bKey) && aKey !== bKey) {
      return aKey - bKey;
    }

    return a.label.localeCompare(b.label);
  });
}
