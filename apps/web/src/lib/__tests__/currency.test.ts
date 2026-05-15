// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  formatCurrency,
  formatCurrencyLabel,
  formatCurrencyValue,
  formatChartCurrency,
  formatGainLoss,
} from '../currency';

// ---------------------------------------------------------------------------
// formatCurrency (cents → display string)
// ---------------------------------------------------------------------------

describe('formatCurrency', () => {
  it('formats a positive amount in cents to dollars', () => {
    expect(formatCurrency(123456)).toBe('$1,234.56');
  });

  it('formats zero as $0.00', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('formats a negative amount with sign before symbol', () => {
    // Intl.NumberFormat en-US places the minus before the dollar sign
    expect(formatCurrency(-123456)).toBe('-$1,234.56');
  });

  it('formats small amounts (under $1)', () => {
    expect(formatCurrency(5)).toBe('$0.05');
    expect(formatCurrency(50)).toBe('$0.50');
    expect(formatCurrency(99)).toBe('$0.99');
  });

  it('formats a single cent', () => {
    expect(formatCurrency(1)).toBe('$0.01');
  });

  it('formats large amounts (millions)', () => {
    // 1,234,567.89 dollars = 123456789 cents
    expect(formatCurrency(123456789)).toBe('$1,234,567.89');
  });

  it('formats very large amounts (billions)', () => {
    expect(formatCurrency(100000000000)).toBe('$1,000,000,000.00');
  });

  it('handles negative zero as $0.00', () => {
    expect(formatCurrency(-0)).toBe('$0.00');
  });

  it('accepts a different currency', () => {
    const result = formatCurrency(1234, { currency: 'EUR', locale: 'en-US' });
    expect(result).toBe('€12.34');
  });

  it('accepts a different locale', () => {
    const result = formatCurrency(1234, { currency: 'EUR', locale: 'de-DE' });
    // German uses comma for decimal, period for grouping
    expect(result).toContain('12,34');
    expect(result).toContain('€');
  });

  it('supports signDisplay: exceptZero for positive values', () => {
    expect(formatCurrency(500, { signDisplay: 'exceptZero' })).toBe('+$5.00');
  });

  it('supports signDisplay: exceptZero for zero', () => {
    expect(formatCurrency(0, { signDisplay: 'exceptZero' })).toBe('$0.00');
  });

  it('supports signDisplay: exceptZero for negative values', () => {
    expect(formatCurrency(-500, { signDisplay: 'exceptZero' })).toBe('-$5.00');
  });

  it('supports signDisplay: never', () => {
    expect(formatCurrency(-500, { signDisplay: 'never' })).toBe('$5.00');
  });

  it('supports custom fraction digits', () => {
    expect(
      formatCurrency(123456, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    ).toBe('$1,235');
  });

  it('handles GBP currency', () => {
    expect(formatCurrency(999, { currency: 'GBP' })).toBe('£9.99');
  });

  it('handles JPY currency (zero-decimal)', () => {
    // JPY has 0 decimal places natively, but we force 2 by default
    const result = formatCurrency(100, { currency: 'JPY' });
    // The function divides by 100, so 100 cents = 1 yen displayed as ¥1.00
    expect(result).toContain('¥');
  });

  it('formats a fractional cent result correctly', () => {
    // 1 cent = $0.01 — no fractional issues with integer input
    expect(formatCurrency(1)).toBe('$0.01');
    expect(formatCurrency(10)).toBe('$0.10');
    expect(formatCurrency(100)).toBe('$1.00');
  });
});

// ---------------------------------------------------------------------------
// formatCurrencyValue (major units → display string)
// ---------------------------------------------------------------------------

describe('formatCurrencyValue', () => {
  it('formats a dollar amount', () => {
    expect(formatCurrencyValue(1234.56)).toBe('$1,234.56');
  });

  it('formats zero', () => {
    expect(formatCurrencyValue(0)).toBe('$0.00');
  });

  it('formats a negative dollar amount', () => {
    expect(formatCurrencyValue(-1234.56)).toBe('-$1,234.56');
  });

  it('formats an integer amount with trailing zeros', () => {
    expect(formatCurrencyValue(1234)).toBe('$1,234.00');
  });

  it('accepts custom fraction digits', () => {
    expect(
      formatCurrencyValue(1234.5, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    ).toBe('$1,235');
  });

  it('accepts a different currency', () => {
    expect(formatCurrencyValue(1234.56, { currency: 'EUR' })).toBe('€1,234.56');
  });
});

// ---------------------------------------------------------------------------
// formatGainLoss (cents → signed display string)
// ---------------------------------------------------------------------------

describe('formatGainLoss', () => {
  it('formats a positive gain with plus sign', () => {
    expect(formatGainLoss(12345)).toBe('+$123.45');
  });

  it('formats a negative loss with minus sign', () => {
    expect(formatGainLoss(-12345)).toBe('-$123.45');
  });

  it('formats zero without any sign', () => {
    expect(formatGainLoss(0)).toBe('$0.00');
  });

  it('formats a small gain', () => {
    expect(formatGainLoss(1)).toBe('+$0.01');
  });

  it('formats a large gain', () => {
    expect(formatGainLoss(12345678)).toBe('+$123,456.78');
  });

  it('accepts a different currency', () => {
    expect(formatGainLoss(12345, { currency: 'GBP' })).toBe('+£123.45');
  });
});

// ---------------------------------------------------------------------------
// formatCurrencyLabel (cents → accessible label)
// ---------------------------------------------------------------------------

describe('formatCurrencyLabel', () => {
  it('formats a positive amount normally', () => {
    expect(formatCurrencyLabel(1234)).toBe('$12.34');
  });

  it('prepends "negative" for negative amounts', () => {
    expect(formatCurrencyLabel(-1234)).toBe('negative $12.34');
  });

  it('formats zero normally', () => {
    expect(formatCurrencyLabel(0)).toBe('$0.00');
  });

  it('accepts a different currency', () => {
    expect(formatCurrencyLabel(-500, { currency: 'EUR' })).toBe('negative €5.00');
  });
});

// ---------------------------------------------------------------------------
// formatChartCurrency (major units → compact chart label)
// ---------------------------------------------------------------------------

describe('formatChartCurrency', () => {
  it('formats a dollar value with no decimals', () => {
    expect(formatChartCurrency(1234)).toBe('$1,234');
  });

  it('rounds to the nearest dollar', () => {
    expect(formatChartCurrency(1234.56)).toBe('$1,235');
  });

  it('formats zero', () => {
    expect(formatChartCurrency(0)).toBe('$0');
  });

  it('formats a negative value', () => {
    expect(formatChartCurrency(-500)).toBe('-$500');
  });

  it('accepts a different currency', () => {
    expect(formatChartCurrency(1234, 'EUR')).toBe('€1,234');
  });

  it('accepts a different locale', () => {
    const result = formatChartCurrency(1234, 'EUR', 'de-DE');
    expect(result).toContain('1.234');
    expect(result).toContain('€');
  });
});
