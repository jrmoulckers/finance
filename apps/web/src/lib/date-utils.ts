// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared calendar-date helpers for the web app.
 *
 * Pure functions — no side effects, fully testable.
 */

/**
 * Adds a whole number of months to an ISO `YYYY-MM-DD` date, clamping the day
 * to the last valid day of the target month.
 *
 * JavaScript's native `Date.setUTCMonth` overflows end-of-month dates — e.g.
 * `Jan 31 + 1 month` rolls forward to `Mar 3` because February has no 31st.
 * For payoff/debt-free projections that produces a date a month too late.
 * Clamping the day (`Jan 31 + 1 month` → `Feb 28/29`) keeps projected dates
 * accurate for end-of-month start dates.
 *
 * @param todayIso - Start date as `YYYY-MM-DD` (interpreted as UTC).
 * @param months - Whole number of months to add (may be 0 or large).
 * @returns The resulting date as a `YYYY-MM-DD` string.
 */
export function addMonthsToIsoDate(todayIso: string, months: number): string {
  const [year, month, day] = todayIso.split('-').map((value) => Number.parseInt(value, 10));
  const startMonthIndex = Math.max(0, month - 1);
  // Land on the first of the target month, then clamp the day to that month's
  // last valid day so end-of-month starts never overflow into the next month.
  const target = new Date(Date.UTC(year, startMonthIndex + months, 1));
  const lastDayOfTargetMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return target.toISOString().slice(0, 10);
}
