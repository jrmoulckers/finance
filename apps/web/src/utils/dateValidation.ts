// SPDX-License-Identifier: BUSL-1.1

/**
 * Centralized date parsing and validation shared across every web date input.
 *
 * This module is the single source of truth for how the web app parses and
 * validates user-entered dates. It deliberately distinguishes the two failure
 * modes that were previously collapsed into one misleading message:
 *
 * - **Malformed** — the text is not shaped like a date at all (e.g. `6/18/25`,
 *   `2025.01.01`, `hello`). The user needs to fix the *format*.
 * - **Invalid calendar date** — the text is well-formed (`MM/DD/YYYY` or ISO
 *   `YYYY-MM-DD`) but does not correspond to a real day on the calendar
 *   (e.g. `12/33/2000`, `02/30/2024`, `13/01/2000`). The format is fine; the
 *   *value* is wrong.
 *
 * Range checks (`min`/`max`) are also handled here so that every field applies
 * the same boundary semantics and messaging.
 */

/** Matches a display date shaped `MM/DD/YYYY` (two/two/four digits). */
export const DISPLAY_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** Matches an ISO date shaped `YYYY-MM-DD`. */
export const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The distinct reasons a date input can fail validation. */
export type DateValidationErrorKind =
  'empty' | 'malformed' | 'invalid-calendar-date' | 'before-min' | 'after-max';

/**
 * User-facing messages for each failure mode. `before-min`/`after-max` are
 * produced dynamically (they embed the boundary date) via
 * {@link getRangeValidationMessage}.
 */
export const DATE_VALIDATION_MESSAGES = {
  empty: 'Enter a date.',
  malformed: 'Enter a date in MM/DD/YYYY format.',
  invalidCalendarDate: 'Not a valid calendar date — check the month and day.',
} as const;

/**
 * Construct a local `Date` at midnight, rejecting values that roll over into a
 * different month/day (e.g. day 33, month 13, Feb 30). Returns `null` when the
 * requested year/month/day is not a real calendar date.
 */
export function createCalendarDate(year: number, monthIndex: number, day: number): Date | null {
  const nextDate = new Date(year, monthIndex, day);

  if (
    nextDate.getFullYear() !== year ||
    nextDate.getMonth() !== monthIndex ||
    nextDate.getDate() !== day
  ) {
    return null;
  }

  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

/**
 * Parse an ISO `YYYY-MM-DD` string into a local `Date`, or `null` if the string
 * is not a well-formed, real calendar date.
 */
export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  return createCalendarDate(Number(yearText), Number(monthText) - 1, Number(dayText));
}

/**
 * Parse a display `MM/DD/YYYY` string into a local `Date`, or `null` if the
 * string is not a well-formed, real calendar date.
 */
export function parseDisplayDate(value: string): Date | null {
  const match = DISPLAY_DATE_PATTERN.exec(value.trim());
  if (!match) return null;

  const [, monthText, dayText, yearText] = match;
  return createCalendarDate(Number(yearText), Number(monthText) - 1, Number(dayText));
}

/** Format a `Date` as an ISO `YYYY-MM-DD` string. */
export function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Format a `Date` as a display `MM/DD/YYYY` string. */
export function formatDisplayDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day}/${date.getFullYear()}`;
}

/** Successful parse of a date string. */
export interface DateParseSuccess {
  readonly ok: true;
  /** Parsed local date at midnight. */
  readonly date: Date;
  /** Canonical ISO `YYYY-MM-DD` representation. */
  readonly iso: string;
}

/** Failed parse of a date string, with a distinct reason and message. */
export interface DateParseFailure {
  readonly ok: false;
  readonly errorKind: Extract<
    DateValidationErrorKind,
    'empty' | 'malformed' | 'invalid-calendar-date'
  >;
  readonly message: string;
}

/** Result of {@link parseDateInput}. */
export type DateParseResult = DateParseSuccess | DateParseFailure;

/**
 * Parse a user-entered date string, accepting either `MM/DD/YYYY` or ISO
 * `YYYY-MM-DD`. Distinguishes malformed input from well-formed-but-invalid
 * calendar dates so callers can surface an accurate message.
 */
export function parseDateInput(rawValue: string): DateParseResult {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return { ok: false, errorKind: 'empty', message: DATE_VALIDATION_MESSAGES.empty };
  }

  const isIso = ISO_DATE_PATTERN.test(trimmed);
  const isDisplay = DISPLAY_DATE_PATTERN.test(trimmed);

  // Not shaped like a supported date format at all.
  if (!isIso && !isDisplay) {
    return { ok: false, errorKind: 'malformed', message: DATE_VALIDATION_MESSAGES.malformed };
  }

  // Well-formed shape — now check it is a real calendar date.
  const date = isIso ? parseIsoDate(trimmed) : parseDisplayDate(trimmed);
  if (date === null) {
    return {
      ok: false,
      errorKind: 'invalid-calendar-date',
      message: DATE_VALIDATION_MESSAGES.invalidCalendarDate,
    };
  }

  return { ok: true, date, iso: formatIsoDate(date) };
}

/**
 * Produce a range-violation message for an ISO date against optional ISO
 * `min`/`max` bounds, or `null` when the date is within range. ISO strings sort
 * lexicographically, so plain string comparison is a valid date comparison.
 */
export function getRangeValidationMessage(
  isoDate: string,
  min?: string,
  max?: string,
): string | null {
  if (min && isoDate < min) {
    const minDate = parseIsoDate(min);
    return minDate
      ? `Date must be on or after ${formatDisplayDate(minDate)}.`
      : 'Date is too early.';
  }

  if (max && isoDate > max) {
    const maxDate = parseIsoDate(max);
    return maxDate
      ? `Date must be on or before ${formatDisplayDate(maxDate)}.`
      : 'Date is too late.';
  }

  return null;
}

/** Options controlling {@link validateDateInput}. */
export interface DateValidationOptions {
  /** Inclusive lower bound as an ISO `YYYY-MM-DD` string. */
  readonly min?: string;
  /** Inclusive upper bound as an ISO `YYYY-MM-DD` string. */
  readonly max?: string;
  /** When `true`, an empty value is treated as invalid. Defaults to `false`. */
  readonly required?: boolean;
}

/** A valid date input result. */
export interface DateValidationSuccess {
  readonly valid: true;
  /** Canonical ISO `YYYY-MM-DD` value, or `''` for an accepted empty value. */
  readonly iso: string;
}

/** An invalid date input result, with the specific failure reason and message. */
export interface DateValidationFailure {
  readonly valid: false;
  readonly errorKind: DateValidationErrorKind;
  readonly message: string;
}

/** Result of {@link validateDateInput}. */
export type DateValidationResult = DateValidationSuccess | DateValidationFailure;

/**
 * Fully validate a user-entered date string: shape, calendar validity, and
 * range. This is the entry point web date inputs should use so behavior and
 * messaging stay consistent across the app.
 *
 * An empty value is valid unless `required` is set. Both `MM/DD/YYYY` and ISO
 * `YYYY-MM-DD` inputs are accepted and normalized to ISO.
 */
export function validateDateInput(
  rawValue: string,
  options: DateValidationOptions = {},
): DateValidationResult {
  const { min, max, required = false } = options;
  const trimmed = rawValue.trim();

  if (!trimmed) {
    if (required) {
      return { valid: false, errorKind: 'empty', message: DATE_VALIDATION_MESSAGES.empty };
    }
    return { valid: true, iso: '' };
  }

  const parsed = parseDateInput(trimmed);
  if (!parsed.ok) {
    return { valid: false, errorKind: parsed.errorKind, message: parsed.message };
  }

  const rangeMessage = getRangeValidationMessage(parsed.iso, min, max);
  if (rangeMessage) {
    return {
      valid: false,
      errorKind: min && parsed.iso < min ? 'before-min' : 'after-max',
      message: rangeMessage,
    };
  }

  return { valid: true, iso: parsed.iso };
}
