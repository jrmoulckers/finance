// SPDX-License-Identifier: BUSL-1.1

/**
 * Format a date string or Date object into a locale-appropriate display format.
 *
 * Uses `Intl.DateTimeFormat` for consistent, locale-aware date formatting.
 * Default format: "Dec 24, 2023" (medium date style).
 *
 * @param date - ISO date string (e.g., "2023-12-24") or Date object
 * @param options - Optional Intl.DateTimeFormatOptions override
 * @returns Formatted date string, or the original value if parsing fails
 */
function parseDateString(value: string): Date {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!dateOnlyMatch) return new Date(value);

  const [, yearText, monthText, dayText] = dateOnlyMatch;
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const day = Number(dayText);
  const parsed = new Date(year, monthIndex, day);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day
  ) {
    return new Date(Number.NaN);
  }

  return parsed;
}

export function formatDate(
  date: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? parseDateString(date) : date;

  if (isNaN(dateObj.getTime())) {
    // Return raw value if date is invalid rather than showing "Invalid Date"
    return typeof date === 'string' ? date : '';
  }

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };

  return new Intl.DateTimeFormat(undefined, options ?? defaultOptions).format(dateObj);
}
