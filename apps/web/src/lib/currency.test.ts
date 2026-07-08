// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  dollarsToCents,
  parseAmountToCents,
  roundToCurrencyPrecision,
  normalizeAmountInputValue,
  minorUnitStep,
} from './currency';

describe('dollarsToCents', () => {
  it('rounds sub-cent precision to the nearest cent', () => {
    expect(dollarsToCents(123213.00002)).toBe(12321300);
    expect(dollarsToCents(12.344)).toBe(1234);
    expect(dollarsToCents(12.345)).toBe(1235); // round half up
    expect(dollarsToCents(12.346)).toBe(1235);
  });

  it('handles zero and negative amounts', () => {
    expect(dollarsToCents(0)).toBe(0);
    expect(dollarsToCents(-1.5)).toBe(-150);
    expect(dollarsToCents(-0.004)).toBe(0);
  });

  it('handles very large values within safe-integer range', () => {
    expect(dollarsToCents(10_000_000_000)).toBe(1_000_000_000_000);
  });

  it('returns 0 for non-finite input', () => {
    expect(dollarsToCents(Number.NaN)).toBe(0);
    expect(dollarsToCents(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('respects per-currency minor-unit precision', () => {
    expect(dollarsToCents(500.6, 'JPY')).toBe(501); // 0 decimals
    expect(dollarsToCents(500, 'JPY')).toBe(500);
    expect(dollarsToCents(1.2345, 'BHD')).toBe(1235); // 3 decimals, round half up on 4th
    expect(dollarsToCents(1.234, 'BHD')).toBe(1234);
  });
});

describe('parseAmountToCents', () => {
  it('parses plain decimal strings, rounding sub-cent precision', () => {
    expect(parseAmountToCents('123213.00002')).toBe(12321300);
    expect(parseAmountToCents('12.34')).toBe(1234);
  });

  it('strips currency symbols, grouping separators and whitespace', () => {
    expect(parseAmountToCents('$1,234.56')).toBe(123456);
    expect(parseAmountToCents('  1 234.50 ')).toBe(123450);
    expect(parseAmountToCents('€99.99', 'EUR')).toBe(9999);
  });

  it('accepts a numeric input directly', () => {
    expect(parseAmountToCents(12.5)).toBe(1250);
    expect(parseAmountToCents(0)).toBe(0);
  });

  it('handles negative amounts including the unicode minus', () => {
    expect(parseAmountToCents('-5.25')).toBe(-525);
    expect(parseAmountToCents('−5.25')).toBe(-525);
  });

  it('returns null for empty or invalid input', () => {
    expect(parseAmountToCents('')).toBeNull();
    expect(parseAmountToCents('   ')).toBeNull();
    expect(parseAmountToCents('.')).toBeNull();
    expect(parseAmountToCents('-')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
    expect(parseAmountToCents(Number.NaN)).toBeNull();
  });

  it('respects per-currency precision', () => {
    expect(parseAmountToCents('500.9', 'JPY')).toBe(501);
    expect(parseAmountToCents('1.2345', 'BHD')).toBe(1235);
  });
});

describe('roundToCurrencyPrecision', () => {
  it('rounds to the minor unit but stays in major units', () => {
    expect(roundToCurrencyPrecision(123213.00002)).toBe(123213);
    expect(roundToCurrencyPrecision(1.017)).toBeCloseTo(1.02, 5);
    expect(roundToCurrencyPrecision(-2.348)).toBeCloseTo(-2.35, 5);
  });

  it('respects per-currency precision', () => {
    expect(roundToCurrencyPrecision(500.6, 'JPY')).toBe(501);
    expect(roundToCurrencyPrecision(1.2345, 'BHD')).toBeCloseTo(1.235, 5);
  });

  it('returns 0 for non-finite input', () => {
    expect(roundToCurrencyPrecision(Number.NaN)).toBe(0);
  });
});

describe('normalizeAmountInputValue', () => {
  it('normalizes sub-cent input to the currency precision', () => {
    expect(normalizeAmountInputValue('123213.00002')).toBe('123213.00');
    expect(normalizeAmountInputValue('5')).toBe('5.00');
    expect(normalizeAmountInputValue('12.5')).toBe('12.50');
  });

  it('handles zero-decimal and three-decimal currencies', () => {
    expect(normalizeAmountInputValue('500.9', 'JPY')).toBe('501');
    expect(normalizeAmountInputValue('1.2345', 'BHD')).toBe('1.235');
  });

  it('returns an empty string for empty or invalid input', () => {
    expect(normalizeAmountInputValue('')).toBe('');
    expect(normalizeAmountInputValue('abc')).toBe('');
  });

  it('preserves the negative sign', () => {
    expect(normalizeAmountInputValue('-3.1')).toBe('-3.10');
  });
});

describe('minorUnitStep', () => {
  it('returns the step for one minor unit', () => {
    expect(minorUnitStep()).toBe('0.01');
    expect(minorUnitStep('USD')).toBe('0.01');
    expect(minorUnitStep('JPY')).toBe('1');
    expect(minorUnitStep('BHD')).toBe('0.001');
  });
});
