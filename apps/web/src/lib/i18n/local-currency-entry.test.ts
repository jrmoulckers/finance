// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  getLocalCurrencyAmountPlaceholder,
  getLocalCurrencyAmountStep,
  parseLocalCurrencyAmountInput,
} from './local-currency-entry';

describe('local-currency-entry', () => {
  it('parses minor-unit-aware transaction amounts without hard-coded cents', () => {
    expect(parseLocalCurrencyAmountInput('1234', 'JPY')).toMatchObject({
      ok: true,
      currency: 'JPY',
      decimalPlaces: 0,
      minorUnits: 1234,
    });
    expect(parseLocalCurrencyAmountInput('12.345', 'BHD')).toMatchObject({
      ok: true,
      currency: 'BHD',
      decimalPlaces: 3,
      minorUnits: 12345,
    });
    expect(parseLocalCurrencyAmountInput('1,234.50', 'MXN')).toMatchObject({
      ok: true,
      minorUnits: 123450,
    });
  });

  it('returns stable catalog IDs for localized validation errors', () => {
    expect(parseLocalCurrencyAmountInput('12.34', 'JPY')).toMatchObject({
      ok: false,
      error: 'too-many-decimals',
      messageId: 'transaction.localAmount.error.tooManyDecimals',
      messageValues: { currency: 'JPY', decimalPlaces: 0 },
    });
    expect(parseLocalCurrencyAmountInput('', 'USD')).toMatchObject({
      ok: false,
      messageId: 'transaction.localAmount.error.required',
    });
  });

  it('derives input affordances from currency metadata', () => {
    expect(getLocalCurrencyAmountStep('JPY')).toBe('1');
    expect(getLocalCurrencyAmountPlaceholder('USD')).toBe('0.00');
    expect(getLocalCurrencyAmountStep('BHD')).toBe('0.001');
  });
});
