// SPDX-License-Identifier: BUSL-1.1

/**
 * Scheduling helpers for recurring/scheduled remittances (issue #3265).
 *
 * A remittance can repeat on a fixed cadence (e.g. a business paying an overseas
 * supplier every month, or family support sent every two weeks). These pure
 * helpers describe the cadence, compute the cash actually leaving the sender's
 * pocket, advance the next scheduled date, and project upcoming occurrences so
 * the cash-runway forecast can treat them as scheduled outflows (issue #3244).
 *
 * Money stays in integer minor units; dates are `YYYY-MM-DD` calendar strings
 * that are never time-zone shifted.
 */

import type {
  RemittanceFrequency,
  RemittanceRecord,
} from './remittance-types';

/** Every supported recurrence cadence, in ascending period length. */
export const REMITTANCE_FREQUENCIES: readonly RemittanceFrequency[] = [
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'yearly',
];

/** Human-readable labels for each recurrence cadence. */
export const REMITTANCE_FREQUENCY_LABELS: Record<RemittanceFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

/**
 * The cash actually leaving the sender's pocket for a remittance, in
 * source-currency minor units.
 *
 * For an `ADDITIVE` fee the sender pays `sendAmount + fee`; for an `INCLUSIVE`
 * fee the fee is already inside `sendAmount`, so the sender pays exactly
 * `sendAmount`. Mirrors `quoteRemittance`'s `totalPaidMinor`.
 */
export function remittanceTotalPaidMinor(record: {
  readonly sendAmountMinor: number;
  readonly feeMinor: number;
  readonly feeModel: RemittanceRecord['feeModel'];
}): number {
  const send = Math.max(0, Math.trunc(record.sendAmountMinor));
  const fee = Math.max(0, Math.trunc(record.feeMinor));
  return record.feeModel === 'INCLUSIVE' ? send : send + fee;
}

function parseIsoDate(date: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function formatIsoDate(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function addDays(date: string, days: number): string {
  const parts = parseIsoDate(date);
  if (!parts) return date;
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day + days);
  return new Date(utc).toISOString().slice(0, 10);
}

/** Days in a given (1-based) month, accounting for leap years. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonths(date: string, months: number): string {
  const parts = parseIsoDate(date);
  if (!parts) return date;
  const zeroBased = parts.month - 1 + months;
  const year = parts.year + Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12; // 0-based, normalised
  // Clamp the day so e.g. Jan-31 + 1 month lands on Feb-28/29, not Mar-03.
  const day = Math.min(parts.day, daysInMonth(year, month + 1));
  return formatIsoDate(year, month + 1, day);
}

/**
 * Advance a scheduled date by exactly one period of the given cadence. Matches
 * the cash-runway forecaster's stepping (weekly/biweekly add days; the rest add
 * calendar months with end-of-month clamping) so a projected schedule and the
 * runway forecast agree.
 */
export function advanceRemittanceDate(date: string, frequency: RemittanceFrequency): string {
  switch (frequency) {
    case 'weekly':
      return addDays(date, 7);
    case 'biweekly':
      return addDays(date, 14);
    case 'monthly':
      return addMonths(date, 1);
    case 'quarterly':
      return addMonths(date, 3);
    case 'yearly':
      return addMonths(date, 12);
    default:
      return date;
  }
}

/** A single projected upcoming occurrence of a recurring remittance. */
export interface UpcomingRemittance {
  readonly record: RemittanceRecord;
  /** Occurrence date, `YYYY-MM-DD`. */
  readonly date: string;
  /** Cash leaving the sender's pocket, in source-currency minor units. */
  readonly totalPaidMinor: number;
}

/**
 * Project the upcoming occurrences of the recurring remittances in `records`
 * that fall within the inclusive `[fromDate, toDate]` window, sorted by date.
 *
 * One-off remittances (no recurrence) are historical and never projected.
 * Occurrences strictly before `fromDate` are skipped; the anchor is the
 * recurrence's `nextDate`.
 */
export function projectUpcomingRemittances(
  records: readonly RemittanceRecord[],
  fromDate: string,
  toDate: string,
  maxPerRecord = 260,
): UpcomingRemittance[] {
  const upcoming: UpcomingRemittance[] = [];

  for (const record of records) {
    const recurrence = record.recurrence;
    if (!recurrence) continue;

    const totalPaidMinor = remittanceTotalPaidMinor(record);
    let date = recurrence.nextDate;
    for (let step = 0; step < maxPerRecord; step += 1) {
      if (date > toDate) break;
      if (date >= fromDate) {
        upcoming.push({ record, date, totalPaidMinor });
      }
      date = advanceRemittanceDate(date, recurrence.frequency);
    }
  }

  return upcoming.sort((a, b) => a.date.localeCompare(b.date));
}
