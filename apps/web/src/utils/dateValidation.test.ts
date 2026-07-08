// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  DATE_VALIDATION_MESSAGES,
  createCalendarDate,
  formatDisplayDate,
  formatIsoDate,
  getRangeValidationMessage,
  parseDateInput,
  parseDisplayDate,
  parseIsoDate,
  validateDateInput,
} from './dateValidation';

describe('createCalendarDate', () => {
  it('accepts a real calendar date', () => {
    const date = createCalendarDate(2024, 1, 29); // 29 Feb 2024 (leap year)
    expect(date).not.toBeNull();
    expect(formatIsoDate(date as Date)).toBe('2024-02-29');
  });

  it('rejects a day that rolls over into the next month', () => {
    expect(createCalendarDate(2000, 11, 33)).toBeNull(); // 33 Dec 2000
    expect(createCalendarDate(2024, 1, 30)).toBeNull(); // 30 Feb 2024
    expect(createCalendarDate(2023, 1, 29)).toBeNull(); // 29 Feb 2023 (non-leap)
  });

  it('rejects an out-of-range month', () => {
    expect(createCalendarDate(2000, 12, 1)).toBeNull(); // month index 12 === month 13
  });
});

describe('parseDisplayDate', () => {
  it('parses a valid MM/DD/YYYY value', () => {
    expect(formatIsoDate(parseDisplayDate('06/18/2025') as Date)).toBe('2025-06-18');
  });

  it('returns null for well-formed but invalid calendar dates', () => {
    expect(parseDisplayDate('12/33/2000')).toBeNull();
    expect(parseDisplayDate('02/30/2024')).toBeNull();
    expect(parseDisplayDate('13/01/2000')).toBeNull();
    expect(parseDisplayDate('00/00/0000')).toBeNull();
  });

  it('returns null for malformed shapes', () => {
    expect(parseDisplayDate('6/18/25')).toBeNull();
    expect(parseDisplayDate('2025-06-18')).toBeNull();
    expect(parseDisplayDate('hello')).toBeNull();
  });
});

describe('parseIsoDate', () => {
  it('parses a valid ISO date', () => {
    expect(formatDisplayDate(parseIsoDate('2024-02-29') as Date)).toBe('02/29/2024');
  });

  it('returns null for invalid ISO calendar dates', () => {
    expect(parseIsoDate('2023-02-29')).toBeNull();
    expect(parseIsoDate('2000-13-01')).toBeNull();
  });

  it('returns null for empty or malformed values', () => {
    expect(parseIsoDate('')).toBeNull();
    expect(parseIsoDate(null)).toBeNull();
    expect(parseIsoDate('06/18/2025')).toBeNull();
  });
});

describe('parseDateInput', () => {
  it('flags empty input distinctly', () => {
    const result = parseDateInput('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorKind).toBe('empty');
      expect(result.message).toBe(DATE_VALIDATION_MESSAGES.empty);
    }
  });

  it('flags malformed shapes with the format message', () => {
    for (const value of ['6/18/25', '2025.01.01', 'hello', '2025/06/18']) {
      const result = parseDateInput(value);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorKind).toBe('malformed');
        expect(result.message).toBe(DATE_VALIDATION_MESSAGES.malformed);
      }
    }
  });

  it('flags well-formed but invalid calendar dates distinctly from malformed input', () => {
    for (const value of ['12/33/2000', '02/30/2024', '13/01/2000', '00/00/0000', '2023-02-29']) {
      const result = parseDateInput(value);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorKind).toBe('invalid-calendar-date');
        expect(result.message).toBe(DATE_VALIDATION_MESSAGES.invalidCalendarDate);
      }
    }
  });

  it('accepts a valid leap-year date', () => {
    const result = parseDateInput('02/29/2024');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.iso).toBe('2024-02-29');
    }
  });

  it('accepts and normalizes both display and ISO input', () => {
    const display = parseDateInput('06/18/2025');
    const iso = parseDateInput('2025-06-18');
    expect(display.ok && display.iso).toBe('2025-06-18');
    expect(iso.ok && iso.iso).toBe('2025-06-18');
  });
});

describe('getRangeValidationMessage', () => {
  it('returns null within range', () => {
    expect(getRangeValidationMessage('2025-06-18', '2025-06-01', '2025-06-30')).toBeNull();
  });

  it('reports before-min with the boundary date', () => {
    expect(getRangeValidationMessage('2025-06-15', '2025-06-16')).toBe(
      'Date must be on or after 06/16/2025.',
    );
  });

  it('reports after-max with the boundary date', () => {
    expect(getRangeValidationMessage('2025-07-01', undefined, '2025-06-30')).toBe(
      'Date must be on or before 06/30/2025.',
    );
  });
});

describe('validateDateInput', () => {
  it('treats empty as valid by default and invalid when required', () => {
    expect(validateDateInput('')).toEqual({ valid: true, iso: '' });

    const required = validateDateInput('', { required: true });
    expect(required).toEqual({
      valid: false,
      errorKind: 'empty',
      message: DATE_VALIDATION_MESSAGES.empty,
    });
  });

  it('distinguishes malformed from invalid calendar dates', () => {
    expect(validateDateInput('6/18/25')).toEqual({
      valid: false,
      errorKind: 'malformed',
      message: DATE_VALIDATION_MESSAGES.malformed,
    });

    expect(validateDateInput('12/33/2000')).toEqual({
      valid: false,
      errorKind: 'invalid-calendar-date',
      message: DATE_VALIDATION_MESSAGES.invalidCalendarDate,
    });
  });

  it('applies min/max range checks', () => {
    expect(validateDateInput('06/15/2025', { min: '2025-06-16' })).toEqual({
      valid: false,
      errorKind: 'before-min',
      message: 'Date must be on or after 06/16/2025.',
    });

    expect(validateDateInput('07/01/2025', { max: '2025-06-30' })).toEqual({
      valid: false,
      errorKind: 'after-max',
      message: 'Date must be on or before 06/30/2025.',
    });
  });

  it('returns the normalized ISO value for a valid date', () => {
    expect(validateDateInput('06/18/2025', { min: '2025-01-01', max: '2025-12-31' })).toEqual({
      valid: true,
      iso: '2025-06-18',
    });
  });
});
