// SPDX-License-Identifier: BUSL-1.1

/**
 * Pure helpers for deriving goal progress and due-date state.
 *
 * These consolidate logic that was previously duplicated (and subtly
 * inconsistent) between `GoalsPage` and `GoalDetailPage`:
 *
 * - Completion is derived from the actual saved-vs-target amounts (or an
 *   explicit `COMPLETED` status) rather than a rounded percentage, so a goal at
 *   99.6% no longer falsely reports "Goal reached!" (#3776, item 1).
 * - The displayed percentage is **floored** below 100 until the goal is truly
 *   complete, matching the completion rule above.
 * - Due-date state uses a **signed** day delta so "Past due", "Due today", and
 *   "N days left" are distinct and consistent across surfaces (#3776, item 2).
 * - Over-target surplus is exposed so the UI can show "over target by $X"
 *   instead of a silent, capped 100% (#3776, item 10).
 *
 * @module lib/goals/progress
 */

import type { Goal, GoalStatus } from '../../kmp/bridge';

const MS_PER_DAY = 86_400_000;

/** Normalise `-0` to `0` so day-delta comparisons are stable. */
function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

/** Derived progress figures for a single goal. */
export interface GoalProgress {
  /** Whole-cent target amount (never negative). */
  targetCents: number;
  /** Whole-cent saved amount (never negative). */
  currentCents: number;
  /** Raw, unrounded completion ratio as a percentage (may exceed 100). */
  rawPercent: number;
  /**
   * Percentage suitable for display and `aria-valuenow`/bar width. Floored so a
   * not-yet-complete goal never shows 100%, and clamped to 100 once complete.
   */
  displayPercent: number;
  /** `true` only when the goal is genuinely complete (amount- or status-based). */
  isComplete: boolean;
  /** Cents still needed to reach the target (0 once complete). */
  remainingCents: number;
  /** Cents saved beyond the target (0 unless over-funded). */
  overageCents: number;
}

/**
 * Derive completion figures for a goal from its saved and target amounts.
 *
 * @param goal - The goal to evaluate.
 * @returns Amount-accurate progress figures for rendering.
 */
export function getGoalProgress(goal: Goal): GoalProgress {
  const targetCents = Math.max(0, goal.targetAmount.amount);
  const currentCents = Math.max(0, goal.currentAmount.amount);

  const rawPercent = targetCents > 0 ? (currentCents / targetCents) * 100 : 0;
  const isComplete =
    goal.status === 'COMPLETED' || (targetCents > 0 && currentCents >= targetCents);

  const displayPercent = isComplete ? 100 : Math.max(0, Math.min(99, Math.floor(rawPercent)));

  return {
    targetCents,
    currentCents,
    rawPercent,
    displayPercent,
    isComplete,
    remainingCents: Math.max(0, targetCents - currentCents),
    overageCents: Math.max(0, currentCents - targetCents),
  };
}

/** Due-date state derived from a goal's ISO target date. */
export interface GoalDueStatus {
  /** Whether the goal has a target date at all. */
  hasDate: boolean;
  /**
   * Signed whole-day delta between now and the target date. Positive means the
   * date is in the future, `0` means today, negative means overdue. `null` when
   * there is no target date.
   */
  daysDelta: number | null;
  /** `true` when the target date is strictly in the past. */
  isPastDue: boolean;
  /** `true` when the target date is today. */
  isDueToday: boolean;
}

/**
 * Derive signed due-date state from an ISO local-date string.
 *
 * @param targetDate - ISO `YYYY-MM-DD` string, or `null` when no date is set.
 * @param now - Reference timestamp in milliseconds (defaults to `Date.now()`).
 * @returns Signed, unclamped due-date state.
 */
export function getGoalDueStatus(
  targetDate: string | null | undefined,
  now: number = Date.now(),
): GoalDueStatus {
  if (!targetDate) {
    return { hasDate: false, daysDelta: null, isPastDue: false, isDueToday: false };
  }

  const target = new Date(`${targetDate}T00:00:00`).getTime();
  if (Number.isNaN(target)) {
    return { hasDate: false, daysDelta: null, isPastDue: false, isDueToday: false };
  }

  const daysDelta = normalizeZero(Math.ceil((target - now) / MS_PER_DAY));

  return {
    hasDate: true,
    daysDelta,
    isPastDue: daysDelta < 0,
    isDueToday: daysDelta === 0,
  };
}

/** Human-readable, capitalised label for a goal status. */
export function formatGoalStatusLabel(status: GoalStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'Active';
    case 'PAUSED':
      return 'Paused';
    case 'COMPLETED':
      return 'Completed';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status;
  }
}
