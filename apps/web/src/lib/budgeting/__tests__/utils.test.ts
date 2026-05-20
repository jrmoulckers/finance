// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { addDays, addMonths, bankersRound, daysBetween, formatDate, parseDate } from '../utils';

// ---------------------------------------------------------------------------
// bankersRound
// ---------------------------------------------------------------------------

describe('bankersRound', () => {
  it('rounds 0.5 to 0 (even)', () => {
    expect(bankersRound(0.5)).toBe(0);
  });

  it('rounds 1.5 to 2 (even)', () => {
    expect(bankersRound(1.5)).toBe(2);
  });

  it('rounds 2.5 to 2 (even)', () => {
    expect(bankersRound(2.5)).toBe(2);
  });

  it('rounds 3.5 to 4 (even)', () => {
    expect(bankersRound(3.5)).toBe(4);
  });

  it('rounds normal values', () => {
    expect(bankersRound(1.4)).toBe(1);
    expect(bankersRound(1.6)).toBe(2);
  });

  it('handles negative values', () => {
    expect(bankersRound(-1.6)).toBe(-2);
    expect(bankersRound(-1.4)).toBe(-1);
  });

  it('passes through integers', () => {
    expect(bankersRound(5)).toBe(5);
    expect(bankersRound(0)).toBe(0);
  });

  it('passes through NaN', () => {
    expect(bankersRound(NaN)).toBeNaN();
  });

  it('passes through Infinity', () => {
    expect(bankersRound(Infinity)).toBe(Infinity);
    expect(bankersRound(-Infinity)).toBe(-Infinity);
  });

  it('handles large values', () => {
    expect(bankersRound(1_000_000.5)).toBe(1_000_000);
    expect(bankersRound(1_000_001.5)).toBe(1_000_002);
  });
});

// ---------------------------------------------------------------------------
// parseDate / formatDate
// ---------------------------------------------------------------------------

describe('parseDate', () => {
  it('parses ISO date string', () => {
    const d = parseDate('2025-06-15');
    expect(d.getUTCFullYear()).toBe(2025);
    expect(d.getUTCMonth()).toBe(5); // 0-indexed
    expect(d.getUTCDate()).toBe(15);
  });
});

describe('formatDate', () => {
  it('formats Date to ISO string', () => {
    const d = new Date(Date.UTC(2025, 0, 5));
    expect(formatDate(d)).toBe('2025-01-05');
  });

  it('pads month and day', () => {
    const d = new Date(Date.UTC(2025, 0, 1));
    expect(formatDate(d)).toBe('2025-01-01');
  });
});

// ---------------------------------------------------------------------------
// daysBetween
// ---------------------------------------------------------------------------

describe('daysBetween', () => {
  it('calculates days between dates', () => {
    expect(daysBetween('2025-01-01', '2025-01-31')).toBe(30);
  });

  it('returns 0 for same date', () => {
    expect(daysBetween('2025-06-01', '2025-06-01')).toBe(0);
  });

  it('returns negative for reversed dates', () => {
    expect(daysBetween('2025-06-30', '2025-06-01')).toBe(-29);
  });
});

// ---------------------------------------------------------------------------
// addDays
// ---------------------------------------------------------------------------

describe('addDays', () => {
  it('adds positive days', () => {
    expect(addDays('2025-01-30', 5)).toBe('2025-02-04');
  });

  it('subtracts days', () => {
    expect(addDays('2025-02-04', -5)).toBe('2025-01-30');
  });

  it('handles month boundary', () => {
    expect(addDays('2025-01-31', 1)).toBe('2025-02-01');
  });
});

// ---------------------------------------------------------------------------
// addMonths
// ---------------------------------------------------------------------------

describe('addMonths', () => {
  it('adds months', () => {
    expect(addMonths('2025-01-15', 3)).toBe('2025-04-15');
  });

  it('handles year boundary', () => {
    expect(addMonths('2025-11-01', 3)).toBe('2026-02-01');
  });

  it('clamps to end of shorter month', () => {
    // Jan 31 + 1 month → Feb 28
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
  });

  it('subtracts months', () => {
    expect(addMonths('2025-06-15', -2)).toBe('2025-04-15');
  });
});
