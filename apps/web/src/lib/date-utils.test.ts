// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { addMonthsToIsoDate, monthsUntilIsoDate } from './date-utils';

describe('addMonthsToIsoDate', () => {
  it('adds whole months for a mid-month start date', () => {
    expect(addMonthsToIsoDate('2025-06-15', 3)).toBe('2025-09-15');
  });

  it('rolls forward across a year boundary', () => {
    expect(addMonthsToIsoDate('2025-11-10', 4)).toBe('2026-03-10');
  });

  it('returns the same date when adding zero months', () => {
    expect(addMonthsToIsoDate('2025-02-28', 0)).toBe('2025-02-28');
  });

  it('clamps Jan 31 + 1 month to Feb 28 (non-leap year) instead of overflowing into March', () => {
    expect(addMonthsToIsoDate('2025-01-31', 1)).toBe('2025-02-28');
  });

  it('clamps Jan 31 + 1 month to Feb 29 in a leap year', () => {
    expect(addMonthsToIsoDate('2024-01-31', 1)).toBe('2024-02-29');
  });

  it('clamps Mar 31 + 1 month to Apr 30', () => {
    expect(addMonthsToIsoDate('2025-03-31', 1)).toBe('2025-04-30');
  });

  it('keeps the day when the target month is long enough', () => {
    expect(addMonthsToIsoDate('2025-01-30', 2)).toBe('2025-03-30');
  });

  it('handles large month counts (100-year non-amortizing horizon)', () => {
    expect(addMonthsToIsoDate('2025-01-31', 1200)).toBe('2125-01-31');
  });
});

describe('monthsUntilIsoDate', () => {
  it('counts whole months within a year', () => {
    expect(monthsUntilIsoDate('2025-01-15', '2025-05-15')).toBe(4);
  });

  it('counts across a year boundary', () => {
    expect(monthsUntilIsoDate('2025-11-01', '2026-03-01')).toBe(4);
  });

  it('ignores the day component', () => {
    expect(monthsUntilIsoDate('2025-01-31', '2025-02-01')).toBe(1);
  });

  it('returns zero within the same month', () => {
    expect(monthsUntilIsoDate('2025-06-01', '2025-06-30')).toBe(0);
  });

  it('returns a negative count for past dates', () => {
    expect(monthsUntilIsoDate('2025-06-01', '2025-03-01')).toBe(-3);
  });

  it('is the month-granularity inverse of addMonthsToIsoDate', () => {
    const today = '2025-04-10';
    for (const n of [0, 1, 6, 18, 60]) {
      expect(monthsUntilIsoDate(today, addMonthsToIsoDate(today, n))).toBe(n);
    }
  });
});
