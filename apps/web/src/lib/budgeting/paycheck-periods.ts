// SPDX-License-Identifier: BUSL-1.1

/**
 * Paycheck-aligned budget period engine.
 *
 * Aligns budget periods to actual pay dates rather than calendar months.
 * Supports weekly, bi-weekly, semi-monthly, and monthly pay frequencies.
 *
 * All date calculations use UTC to avoid timezone ambiguity.
 *
 * References: #1565
 */

import type { PaycheckConfig, PaycheckPeriod } from './advanced-types';
import { PayFrequency } from './advanced-types';
import { addDays, formatDate, parseDate } from './utils';

// ---------------------------------------------------------------------------
// Period generation
// ---------------------------------------------------------------------------

/**
 * Generate paycheck-aligned budget periods within a date range.
 *
 * Each period starts on a pay date and ends the day before the next pay date.
 *
 * @param config - Paycheck configuration with frequency and anchor date.
 * @param rangeStartStr - Start of the range (ISO 8601).
 * @param rangeEndStr - End of the range (ISO 8601).
 * @returns Array of {@link PaycheckPeriod} covering the range.
 */
export function generatePaycheckPeriods(
  config: PaycheckConfig,
  rangeStartStr: string,
  rangeEndStr: string,
): readonly PaycheckPeriod[] {
  const rangeStart = parseDate(rangeStartStr);
  const rangeEnd = parseDate(rangeEndStr);

  if (rangeEnd <= rangeStart) {
    return [];
  }

  const payDates = generatePayDates(config, rangeStartStr, rangeEndStr);

  if (payDates.length === 0) {
    return [];
  }

  const periods: PaycheckPeriod[] = [];

  for (let i = 0; i < payDates.length; i++) {
    const startDate = payDates[i];
    const endDate = i < payDates.length - 1 ? addDays(payDates[i + 1], -1) : rangeEndStr;

    const days = dayCount(startDate, endDate);
    periods.push({
      startDate,
      endDate,
      days,
      label: formatPeriodLabel(startDate, endDate),
    });
  }

  return periods;
}

// ---------------------------------------------------------------------------
// Next pay date
// ---------------------------------------------------------------------------

/**
 * Find the next pay date on or after a given date.
 *
 * @param config - Paycheck configuration.
 * @param fromDateStr - Reference date (ISO 8601).
 * @returns The next pay date as an ISO date string.
 */
export function getNextPayDate(config: PaycheckConfig, fromDateStr: string): string {
  const from = parseDate(fromDateStr);
  const anchor = parseDate(config.firstPayDate);

  switch (config.frequency) {
    case PayFrequency.WEEKLY:
      return findNextRecurring(anchor, from, 7);

    case PayFrequency.BIWEEKLY:
      return findNextRecurring(anchor, from, 14);

    case PayFrequency.MONTHLY:
      return findNextMonthly(anchor, from);

    case PayFrequency.SEMI_MONTHLY:
      return findNextSemiMonthly(anchor, from, config.secondPayDay ?? 15);
  }
}

// ---------------------------------------------------------------------------
// Pay date generation
// ---------------------------------------------------------------------------

/**
 * Generate all pay dates within a range.
 *
 * @param config - Paycheck configuration.
 * @param rangeStartStr - Range start (ISO 8601).
 * @param rangeEndStr - Range end (ISO 8601).
 * @returns Array of pay date strings in ascending order.
 */
function generatePayDates(
  config: PaycheckConfig,
  rangeStartStr: string,
  rangeEndStr: string,
): string[] {
  const rangeEnd = parseDate(rangeEndStr);
  const dates: string[] = [];

  let current = getNextPayDate(config, rangeStartStr);

  while (parseDate(current) <= rangeEnd) {
    dates.push(current);
    current = getNextPayDateAfter(config, current);
  }

  return dates;
}

/**
 * Get the pay date strictly after a given pay date.
 *
 * @param config - Paycheck configuration.
 * @param payDateStr - Current pay date (ISO 8601).
 * @returns The next pay date.
 */
function getNextPayDateAfter(config: PaycheckConfig, payDateStr: string): string {
  const next = addDays(payDateStr, 1);
  return getNextPayDate(config, next);
}

// ---------------------------------------------------------------------------
// Frequency-specific helpers
// ---------------------------------------------------------------------------

/**
 * Find the next recurring date from an anchor with a fixed interval.
 *
 * @param anchor - Anchor date.
 * @param from - Reference date (find next on or after this).
 * @param intervalDays - Number of days per interval.
 * @returns ISO date string.
 */
function findNextRecurring(anchor: Date, from: Date, intervalDays: number): string {
  const msPerDay = 86_400_000;
  const diffDays = Math.floor((from.getTime() - anchor.getTime()) / msPerDay);

  if (diffDays < 0) {
    // from is before anchor — anchor is the next date
    return formatDate(anchor);
  }

  const periodsPassed = Math.floor(diffDays / intervalDays);
  const candidate = new Date(anchor.getTime() + periodsPassed * intervalDays * msPerDay);

  if (candidate >= from) {
    return formatDate(candidate);
  }

  return formatDate(new Date(candidate.getTime() + intervalDays * msPerDay));
}

/**
 * Find the next monthly pay date.
 *
 * @param anchor - Anchor date (day of month determines pay day).
 * @param from - Reference date.
 * @returns ISO date string.
 */
function findNextMonthly(anchor: Date, from: Date): string {
  const payDay = anchor.getUTCDate();
  let year = from.getUTCFullYear();
  let month = from.getUTCMonth();

  // Try this month first
  const candidate = clampDay(year, month, payDay);
  if (candidate >= from) {
    return formatDate(candidate);
  }

  // Next month
  month += 1;
  if (month > 11) {
    month = 0;
    year += 1;
  }
  return formatDate(clampDay(year, month, payDay));
}

/**
 * Find the next semi-monthly pay date.
 *
 * Semi-monthly pays on the anchor day and a second day each month.
 *
 * @param anchor - Anchor date (first pay day of month).
 * @param from - Reference date.
 * @param secondDay - Second pay day of month.
 * @returns ISO date string.
 */
function findNextSemiMonthly(anchor: Date, from: Date, secondDay: number): string {
  const firstDay = anchor.getUTCDate();
  let year = from.getUTCFullYear();
  let month = from.getUTCMonth();

  // Order the two pay days within each month
  const [dayA, dayB] = firstDay <= secondDay ? [firstDay, secondDay] : [secondDay, firstDay];

  // Try this month's first pay day
  const candidateA = clampDay(year, month, dayA);
  if (candidateA >= from) {
    return formatDate(candidateA);
  }

  // Try this month's second pay day
  const candidateB = clampDay(year, month, dayB);
  if (candidateB >= from) {
    return formatDate(candidateB);
  }

  // Next month's first pay day
  month += 1;
  if (month > 11) {
    month = 0;
    year += 1;
  }
  return formatDate(clampDay(year, month, dayA));
}

// ---------------------------------------------------------------------------
// Date utilities
// ---------------------------------------------------------------------------

/**
 * Create a UTC Date clamped to the last day of the month if needed.
 *
 * @param year - Full year.
 * @param month - Zero-based month.
 * @param day - Desired day of month.
 * @returns Clamped Date.
 */
function clampDay(year: number, month: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

/**
 * Count days between two dates (inclusive on both ends).
 *
 * @param startStr - Start date (ISO 8601).
 * @param endStr - End date (ISO 8601).
 * @returns Number of days.
 */
function dayCount(startStr: string, endStr: string): number {
  const start = parseDate(startStr);
  const end = parseDate(endStr);
  const msPerDay = 86_400_000;
  return Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;
}

/**
 * Format a period label like "May 1 – May 14".
 *
 * @param startStr - Period start date.
 * @param endStr - Period end date.
 * @returns Formatted label string.
 */
function formatPeriodLabel(startStr: string, endStr: string): string {
  const start = parseDate(startStr);
  const end = parseDate(endStr);

  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  const startMonth = monthNames[start.getUTCMonth()];
  const endMonth = monthNames[end.getUTCMonth()];
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} – ${endDay}`;
  }

  return `${startMonth} ${startDay} – ${endMonth} ${endDay}`;
}
