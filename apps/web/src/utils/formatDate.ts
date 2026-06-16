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
export function formatDate(
  date: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!date) return '';

  const dateObj =
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Date(`${date}T00:00:00`)
      : typeof date === 'string'
        ? new Date(date)
        : date;

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
