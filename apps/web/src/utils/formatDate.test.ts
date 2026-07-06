// SPDX-License-Identifier: BUSL-1.1

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getCurrentLocale } from '../lib/i18n';
import { formatDate, formatTransactionTimestamp, parseTransactionTimestamp } from './formatDate';

vi.mock('../lib/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/i18n')>();
  return { ...actual, getCurrentLocale: vi.fn(() => 'en-US') };
});

describe('formatDate', () => {
  it('formats an ISO date string', () => {
    const result = formatDate('2023-12-24');
    // The exact format depends on the test locale, but it should contain "2023" and "24"
    expect(result).toContain('2023');
    expect(result).toContain('24');
  });

  it('formats a Date object', () => {
    const result = formatDate(new Date(2023, 11, 24)); // Dec 24, 2023
    expect(result).toContain('2023');
    expect(result).toContain('24');
  });

  it('returns empty string for null', () => {
    expect(formatDate(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatDate(undefined)).toBe('');
  });

  it('returns raw string for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });

  it('accepts custom Intl options', () => {
    const result = formatDate('2023-12-24', { year: 'numeric', month: 'long', day: 'numeric' });
    expect(result).toContain('2023');
  });

  it('keeps date-only strings on the same calendar day across time zones', () => {
    const result = formatDate('2024-03-01', {
      locale: 'en-US',
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    expect(result).toBe('03/01/2024');
  });

  it('parses date-only bank exports without creating an instant', () => {
    expect(parseTransactionTimestamp('2024-03-10', 'America/New_York')).toEqual({
      localDate: '2024-03-10',
      instant: null,
      timeZone: null,
      originalOffset: null,
      dateOnly: true,
    });
  });

  it('preserves timezone-aware imported timestamps around DST', () => {
    const parsed = parseTransactionTimestamp('2024-03-10T01:30:00-05:00', 'America/New_York');

    expect(parsed.localDate).toBe('2024-03-10');
    expect(parsed.instant).toBe('2024-03-10T06:30:00.000Z');
    expect(parsed.originalOffset).toBe('-05:00');
    expect(parsed.dateOnly).toBe(false);
  });

  it('renders exact transaction timestamps in the selected home timezone', () => {
    const formatted = formatTransactionTimestamp('2024-02-01T07:30:00Z', {
      locale: 'en-US',
      timeZone: 'America/Los_Angeles',
    });

    expect(formatted).toContain('Jan 31, 2024');
    expect(formatted).toContain('PST');
  });
});

describe('formatDate honors the active locale preference', () => {
  const numericOptions = { day: '2-digit', month: '2-digit', year: 'numeric' } as const;
  // dateFromDateOnly('2024-03-01') anchors the date at UTC noon (see formatDate.ts).
  const dateOnlyAnchor = new Date(Date.UTC(2024, 2, 1, 12, 0, 0));

  afterEach(() => {
    vi.mocked(getCurrentLocale).mockReturnValue('en-US');
  });

  it('formats a date-only value using the active locale, not a hardcoded en-US format', () => {
    vi.mocked(getCurrentLocale).mockReturnValue('de-DE');

    const result = formatDate('2024-03-01', numericOptions);
    const reference = new Intl.DateTimeFormat('de-DE', {
      ...numericOptions,
      timeZone: 'UTC',
    }).format(dateOnlyAnchor);

    expect(result).toBe(reference);
    // German convention is DD.MM.YYYY — distinct from the US MM/DD/YYYY default.
    expect(result).toBe('01.03.2024');
  });

  it('produces locale-distinct output when the active locale changes', () => {
    vi.mocked(getCurrentLocale).mockReturnValue('en-US');
    const usFormatted = formatDate('2024-03-01', numericOptions);

    vi.mocked(getCurrentLocale).mockReturnValue('es-ES');
    const esFormatted = formatDate('2024-03-01', numericOptions);

    expect(usFormatted).toBe('03/01/2024');
    // Spain uses DD/MM/YYYY, so the same instant renders differently.
    expect(esFormatted).toBe('01/03/2024');
    expect(esFormatted).not.toBe(usFormatted);
  });

  it('falls back to the default locale when the active locale is en-US', () => {
    vi.mocked(getCurrentLocale).mockReturnValue('en-US');

    const result = formatDate('2024-03-01', numericOptions);
    const reference = new Intl.DateTimeFormat('en-US', {
      ...numericOptions,
      timeZone: 'UTC',
    }).format(dateOnlyAnchor);

    expect(result).toBe(reference);
  });

  it('formats transaction timestamps with the active locale by default', () => {
    vi.mocked(getCurrentLocale).mockReturnValue('en-US');
    const usFormatted = formatTransactionTimestamp('2024-03-01T12:00:00Z', { timeZone: 'UTC' });

    vi.mocked(getCurrentLocale).mockReturnValue('de-DE');
    const deFormatted = formatTransactionTimestamp('2024-03-01T12:00:00Z', { timeZone: 'UTC' });

    // Same instant + timezone, different active locale → different rendering.
    expect(deFormatted).not.toBe(usFormatted);
  });
});
