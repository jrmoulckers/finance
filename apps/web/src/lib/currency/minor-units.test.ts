// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  getCurrencyDecimals,
  minorUnitFactor,
  minorUnitsToMajorNumber,
  normalizeCurrencyCode,
  parseAmountToMinorUnits,
  readFxMetadata,
} from './minor-units';
import { ENTRY_CURRENCY_CODES, getEntryCurrencyOptions } from './entry-currencies';
import { buildFxCustomFields, convertToBaseMinorUnits, roundToInteger } from './fx-convert';

describe('getCurrencyDecimals', () => {
  it('returns 2 for standard two-decimal currencies', () => {
    expect(getCurrencyDecimals('USD')).toBe(2);
    expect(getCurrencyDecimals('EUR')).toBe(2);
    expect(getCurrencyDecimals('THB')).toBe(2);
    expect(getCurrencyDecimals('MXN')).toBe(2);
  });

  it('returns 0 for zero-decimal currencies', () => {
    expect(getCurrencyDecimals('JPY')).toBe(0);
    expect(getCurrencyDecimals('KRW')).toBe(0);
    expect(getCurrencyDecimals('VND')).toBe(0);
  });

  it('returns 3 for three-decimal Gulf currencies', () => {
    expect(getCurrencyDecimals('KWD')).toBe(3);
    expect(getCurrencyDecimals('BHD')).toBe(3);
    expect(getCurrencyDecimals('OMR')).toBe(3);
  });

  it('is case-insensitive and tolerant of whitespace', () => {
    expect(getCurrencyDecimals(' jpy ')).toBe(0);
    expect(getCurrencyDecimals('usd')).toBe(2);
  });

  it('falls back to 2 for unknown or invalid codes', () => {
    expect(getCurrencyDecimals('')).toBe(2);
    expect(getCurrencyDecimals(null)).toBe(2);
    expect(getCurrencyDecimals('ZZZ123')).toBe(2);
  });
});

describe('minorUnitFactor', () => {
  it('computes 10 ** decimals', () => {
    expect(minorUnitFactor('USD')).toBe(100);
    expect(minorUnitFactor('JPY')).toBe(1);
    expect(minorUnitFactor('KWD')).toBe(1000);
  });
});

describe('getEntryCurrencyOptions', () => {
  it('includes the previously-missing nomad currencies THB and MXN', () => {
    const codes = getEntryCurrencyOptions().map((c) => c.code);
    expect(codes).toContain('THB');
    expect(codes).toContain('MXN');
    expect(ENTRY_CURRENCY_CODES).toContain('THB');
    expect(ENTRY_CURRENCY_CODES).toContain('MXN');
  });

  it('covers 0/2/3-decimal currencies', () => {
    const options = getEntryCurrencyOptions();
    expect(options.some((c) => c.decimalPlaces === 0)).toBe(true);
    expect(options.some((c) => c.decimalPlaces === 2)).toBe(true);
    expect(options.some((c) => c.decimalPlaces === 3)).toBe(true);
  });

  it('declares decimalPlaces matching getCurrencyDecimals and a non-empty label', () => {
    for (const option of getEntryCurrencyOptions()) {
      expect(option.decimalPlaces).toBe(getCurrencyDecimals(option.code));
      expect(option.label).toContain(option.code);
      expect(option.label.length).toBeGreaterThan(0);
    }
  });
});

describe('normalizeCurrencyCode', () => {
  it('uppercases valid 3-letter codes', () => {
    expect(normalizeCurrencyCode('usd')).toBe('USD');
    expect(normalizeCurrencyCode(' eur ')).toBe('EUR');
  });

  it('returns null for invalid input', () => {
    expect(normalizeCurrencyCode('')).toBeNull();
    expect(normalizeCurrencyCode(null)).toBeNull();
    expect(normalizeCurrencyCode('US')).toBeNull();
    expect(normalizeCurrencyCode('US1')).toBeNull();
  });
});

describe('roundToInteger', () => {
  it('rounds half away from zero symmetrically', () => {
    expect(roundToInteger(0.5)).toBe(1);
    expect(roundToInteger(-0.5)).toBe(-1);
    expect(roundToInteger(2.4)).toBe(2);
    expect(roundToInteger(-2.6)).toBe(-3);
  });

  it('returns 0 for non-finite input', () => {
    expect(roundToInteger(Number.NaN)).toBe(0);
    expect(roundToInteger(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('parseAmountToMinorUnits', () => {
  it('parses two-decimal currencies into integer cents', () => {
    expect(parseAmountToMinorUnits('12.34', 'USD')).toBe(1234);
    expect(parseAmountToMinorUnits('1,000', 'THB')).toBe(100000);
    expect(parseAmountToMinorUnits('0.09', 'EUR')).toBe(9);
  });

  it('parses zero-decimal currencies with no minor units', () => {
    expect(parseAmountToMinorUnits('1000', 'JPY')).toBe(1000);
    // Extra fractional digits are truncated for a 0-decimal currency.
    expect(parseAmountToMinorUnits('1000.50', 'JPY')).toBe(1000);
  });

  it('parses three-decimal currencies into thousandths', () => {
    expect(parseAmountToMinorUnits('1.234', 'KWD')).toBe(1234);
    expect(parseAmountToMinorUnits('1.2', 'BHD')).toBe(1200);
  });

  it('truncates excess fractional digits rather than rounding', () => {
    expect(parseAmountToMinorUnits('1.239', 'USD')).toBe(123);
  });

  it('honours a leading minus sign', () => {
    expect(parseAmountToMinorUnits('-5.00', 'USD')).toBe(-500);
    expect(parseAmountToMinorUnits('\u22125', 'JPY')).toBe(-5);
  });

  it('returns null when there are no digits', () => {
    expect(parseAmountToMinorUnits('', 'USD')).toBeNull();
    expect(parseAmountToMinorUnits('abc', 'USD')).toBeNull();
  });
});

describe('minorUnitsToMajorNumber', () => {
  it('divides by the minor-unit factor', () => {
    expect(minorUnitsToMajorNumber(123456, 'USD')).toBeCloseTo(1234.56);
    expect(minorUnitsToMajorNumber(1000, 'JPY')).toBe(1000);
    expect(minorUnitsToMajorNumber(1234, 'KWD')).toBeCloseTo(1.234);
  });
});

describe('convertToBaseMinorUnits', () => {
  it('converts a same-precision foreign amount with exact integer rounding', () => {
    // 1000.00 THB at 1 THB = 0.029 USD => 29.00 USD
    expect(
      convertToBaseMinorUnits({
        originalMinorUnits: 100000,
        originalDecimals: 2,
        baseDecimals: 2,
        rate: 0.029,
      }),
    ).toBe(2900);
  });

  it('converts a 0-decimal foreign currency into 2-decimal base minor units', () => {
    // 10000 JPY at 1 JPY = 0.0067 USD => 67.00 USD
    expect(
      convertToBaseMinorUnits({
        originalMinorUnits: 10000,
        originalDecimals: 0,
        baseDecimals: 2,
        rate: 0.0067,
      }),
    ).toBe(6700);
  });

  it('converts a 3-decimal foreign currency without losing cents', () => {
    // 1.234 KWD at 1 KWD = 3.25 USD => 4.0105 USD => rounds to 4.01 USD (401 cents)
    expect(
      convertToBaseMinorUnits({
        originalMinorUnits: 1234,
        originalDecimals: 3,
        baseDecimals: 2,
        rate: 3.25,
      }),
    ).toBe(401);
  });

  it('converts a 2-decimal foreign currency into a 0-decimal base currency', () => {
    // 250.00 MXN at 1 MXN = 7.5 JPY => 1875 JPY (0 decimals)
    expect(
      convertToBaseMinorUnits({
        originalMinorUnits: 25000,
        originalDecimals: 2,
        baseDecimals: 0,
        rate: 7.5,
      }),
    ).toBe(1875);
  });

  it('preserves sign and rounds magnitude symmetrically', () => {
    // -345 MXN minor at rate that yields a half-cent: rounds away from zero
    expect(
      convertToBaseMinorUnits({
        originalMinorUnits: -345,
        originalDecimals: 2,
        baseDecimals: 2,
        rate: 0.05,
      }),
    ).toBe(-17); // 345 * 0.05 = 17.25 -> 17, sign preserved
  });

  it('rounds a half-minor-unit away from zero', () => {
    // 10 units * rate 0.05 = 0.5 -> 1 (round half away from zero)
    expect(
      convertToBaseMinorUnits({
        originalMinorUnits: 10,
        originalDecimals: 2,
        baseDecimals: 2,
        rate: 0.05,
      }),
    ).toBe(1);
  });

  it('returns 0 for a non-positive or non-finite rate', () => {
    const base = { originalMinorUnits: 100000, originalDecimals: 2, baseDecimals: 2 };
    expect(convertToBaseMinorUnits({ ...base, rate: 0 })).toBe(0);
    expect(convertToBaseMinorUnits({ ...base, rate: -1 })).toBe(0);
    expect(convertToBaseMinorUnits({ ...base, rate: Number.NaN })).toBe(0);
  });
});

describe('FX customFields round-trip', () => {
  it('builds and reads back foreign-currency metadata', () => {
    const fields = buildFxCustomFields({
      originalAmountMinor: -100000,
      originalCurrency: 'THB',
      rate: '0.029',
      rateTimestamp: '2026-06-22T10:00:00.000Z',
      baseCurrency: 'USD',
    });

    expect(fields.fxCcy).toBe('THB');
    expect(fields.fxAmtMinor).toBe('-100000');

    const parsed = readFxMetadata(fields);
    expect(parsed).toEqual({
      originalAmountMinor: -100000,
      originalCurrency: 'THB',
      rate: '0.029',
      rateTimestamp: '2026-06-22T10:00:00.000Z',
      baseCurrency: 'USD',
    });
  });

  it('omits the timestamp when not supplied and still parses', () => {
    const fields = buildFxCustomFields({
      originalAmountMinor: 5000,
      originalCurrency: 'MXN',
      rate: '0.058',
      rateTimestamp: null,
      baseCurrency: 'USD',
    });

    expect(fields.fxRateTs).toBeUndefined();
    expect(readFxMetadata(fields)?.rateTimestamp).toBeNull();
  });

  it('returns null for absent or incomplete metadata', () => {
    expect(readFxMetadata(null)).toBeNull();
    expect(readFxMetadata({})).toBeNull();
    expect(readFxMetadata({ fxCcy: 'THB' })).toBeNull();
  });
});
