// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { addMonthsToIsoDate } from './date-utils';

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
