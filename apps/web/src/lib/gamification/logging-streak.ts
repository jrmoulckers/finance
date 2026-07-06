// SPDX-License-Identifier: BUSL-1.1

/**
 * Pure daily-logging-streak calculation for gamification.
 *
 * Transaction dates are stored as *local* calendar dates (`YYYY-MM-DD`, see
 * {@link toLocalDate}). Streak math must therefore use the same local
 * convention rather than UTC `toISOString`, which is off-by-one for evening
 * logging in negative-UTC timezones.
 *
 * The *current* streak only counts when the run reaches today or yesterday (a
 * one-day grace period). If the most recent activity is older than yesterday,
 * the streak is considered broken and reported as 0 — a stale historical run
 * is never surfaced as the current streak.
 *
 * References: issues #3292, #3295
 */

import { toLocalDate } from '../insights/helpers';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Result of {@link computeLoggingStreak}. */
export interface LoggingStreak {
  /** Consecutive days ending today/yesterday; 0 when the streak is broken. */
  readonly current: number;
  /** Longest consecutive run anywhere in the history. */
  readonly longest: number;
  /** Whether a transaction exists for the local "today". */
  readonly loggedToday: boolean;
}

/**
 * Computes the current and longest daily-logging streaks from a set of local
 * transaction dates.
 *
 * @param dates - Iterable of local `YYYY-MM-DD` date strings (deduped internally)
 * @param now - The reference "now" (injectable for deterministic tests)
 * @returns Current streak, longest streak, and whether today has activity
 */
export function computeLoggingStreak(
  dates: Iterable<string>,
  now: Date = new Date(),
): LoggingStreak {
  const dateSet = dates instanceof Set ? (dates as Set<string>) : new Set(dates);

  const today = new Date(now);
  const loggedToday = dateSet.has(toLocalDate(today));

  if (dateSet.size === 0) {
    return { current: 0, longest: 0, loggedToday };
  }

  // Current streak, anchored to today or (as a grace) yesterday.
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let current = 0;
  if (loggedToday || dateSet.has(toLocalDate(yesterday))) {
    const cursor = loggedToday ? new Date(today) : new Date(yesterday);
    while (dateSet.has(toLocalDate(cursor))) {
      current++;
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  // Longest streak across the full sorted history.
  const sorted = Array.from(dateSet).sort();
  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const key of sorted) {
    const day = new Date(`${key}T00:00:00`);
    if (prev) {
      const diffDays = Math.round((day.getTime() - prev.getTime()) / MS_PER_DAY);
      run = diffDays === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prev = day;
  }

  return { current, longest, loggedToday };
}
