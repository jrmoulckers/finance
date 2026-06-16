// SPDX-License-Identifier: BUSL-1.1

import { getCurrentLocale, getCurrentTimeZone } from '../lib/i18n';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const OFFSET_PATTERN = /(Z|[+-]\d{2}:?\d{2})$/;

export interface FormatDateOptions extends Intl.DateTimeFormatOptions {
  readonly locale?: string;
}

export interface ParsedTransactionTimestamp {
  readonly localDate: string;
  readonly instant: string | null;
  readonly timeZone: string | null;
  readonly originalOffset: string | null;
  readonly dateOnly: boolean;
}

function formatLocalDateInTimeZone(date: Date, timeZone: string, locale = 'en-CA'): string {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((value) => value.type === type)?.value ?? '01';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function dateFromDateOnly(localDate: string): Date {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

/**
 * Parse imported transaction dates without shifting YYYY-MM-DD values across
 * UTC/local boundaries. Date-only bank exports keep a local-date model; exact
 * ISO timestamps retain their instant and timezone/offset metadata.
 */
export function parseTransactionTimestamp(
  value: string,
  timeZone: string = getCurrentTimeZone(),
): ParsedTransactionTimestamp {
  if (DATE_ONLY_PATTERN.test(value)) {
    return {
      localDate: value,
      instant: null,
      timeZone: null,
      originalOffset: null,
      dateOnly: true,
    };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      localDate: value,
      instant: null,
      timeZone: null,
      originalOffset: null,
      dateOnly: false,
    };
  }

  return {
    localDate: formatLocalDateInTimeZone(date, timeZone),
    instant: date.toISOString(),
    timeZone,
    originalOffset: value.match(OFFSET_PATTERN)?.[1] ?? null,
    dateOnly: false,
  };
}

/**
 * Format a date string or Date object into a locale-appropriate display format.
 * Date-only strings are rendered as local dates and never shifted by timezone.
 */
export function formatDate(
  date: string | Date | null | undefined,
  options?: FormatDateOptions,
): string {
  if (!date) return '';

  const { locale = getCurrentLocale(), ...intlOptions } = options ?? {};
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };
  const formatterOptions = Object.keys(intlOptions).length > 0 ? intlOptions : defaultOptions;
  const isDateOnly = typeof date === 'string' && DATE_ONLY_PATTERN.test(date);
  const dateObj = isDateOnly
    ? dateFromDateOnly(date)
    : typeof date === 'string'
      ? new Date(date)
      : date;

  if (Number.isNaN(dateObj.getTime())) {
    return typeof date === 'string' ? date : '';
  }

  return new Intl.DateTimeFormat(locale, {
    ...formatterOptions,
    timeZone: isDateOnly ? 'UTC' : (formatterOptions.timeZone ?? getCurrentTimeZone()),
  }).format(dateObj);
}

export function formatTransactionTimestamp(
  value: string | Date | null | undefined,
  options: FormatDateOptions = {},
): string {
  if (!value) return '';
  const locale = options.locale ?? getCurrentLocale();
  const timeZone = options.timeZone ?? getCurrentTimeZone();

  if (typeof value === 'string' && DATE_ONLY_PATTERN.test(value)) {
    return formatDate(value, { ...options, locale });
  }

  const dateObj = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(dateObj.getTime())) {
    return typeof value === 'string' ? value : '';
  }

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    ...options,
    timeZone,
  }).format(dateObj);
}
