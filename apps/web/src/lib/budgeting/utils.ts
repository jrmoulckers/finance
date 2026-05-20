// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared utility functions for budgeting engines.
 *
 * References: #1559
 */

// ---------------------------------------------------------------------------
// Banker's rounding (HALF_EVEN)
// ---------------------------------------------------------------------------

/**
 * Round a value to the nearest integer using banker's rounding (HALF_EVEN).
 *
 * When the fractional part is exactly 0.5 the value is rounded to the
 * nearest **even** integer, eliminating systematic upward rounding bias.
 *
 * @param value - The number to round.
 * @returns The rounded integer.
 */
export function bankersRound(value: number): number {
  if (!Number.isFinite(value)) {
    return value; // NaN, ±Infinity pass through
  }

  const floored = Math.floor(value);
  const fraction = value - floored;

  const EPSILON = 1e-9;

  if (Math.abs(fraction - 0.5) < EPSILON) {
    // Exactly half — round to even
    return floored % 2 === 0 ? floored : floored + 1;
  }

  return Math.round(value);
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Parse an ISO 8601 date string (YYYY-MM-DD) to a Date in UTC.
 *
 * @param dateStr - ISO date string.
 * @returns A Date object set to midnight UTC on the given date.
 */
export function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Format a Date as an ISO 8601 date string (YYYY-MM-DD).
 *
 * @param date - The date to format.
 * @returns ISO date string.
 */
export function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Calculate the number of days between two dates (inclusive of start, exclusive of end).
 *
 * @param startDate - Start date string (ISO 8601).
 * @param endDate - End date string (ISO 8601).
 * @returns Number of days.
 */
export function daysBetween(startDate: string, endDate: string): number {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const msPerDay = 86_400_000;
  return Math.round((end.getTime() - start.getTime()) / msPerDay);
}

/**
 * Add a number of days to a date string.
 *
 * @param dateStr - ISO date string.
 * @param days - Number of days to add (can be negative).
 * @returns New ISO date string.
 */
export function addDays(dateStr: string, days: number): string {
  const date = parseDate(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

/**
 * Add a number of months to a date string.
 *
 * If the resulting month has fewer days, clamps to the last day of that month.
 *
 * @param dateStr - ISO date string.
 * @param months - Number of months to add (can be negative).
 * @returns New ISO date string.
 */
export function addMonths(dateStr: string, months: number): string {
  const date = parseDate(dateStr);
  const day = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + months);
  // Clamp if day overflowed (e.g. Jan 31 + 1 month → Mar 3 → clamp to Feb 28)
  if (date.getUTCDate() !== day) {
    date.setUTCDate(0); // go to last day of previous month
  }
  return formatDate(date);
}
