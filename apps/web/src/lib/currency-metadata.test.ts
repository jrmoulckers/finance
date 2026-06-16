// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  FALLBACK_CURRENCY,
  getCurrencyFractionDigits,
  getCurrencyMetadata,
  getSafeCurrencyCode,
  minorUnitFactor,
  normalizeCurrencyCode,
} from './currency-metadata';

describe('currency metadata', () => {
  it('normalizes ISO currency codes and falls back for invalid input', () => {
    expect(normalizeCurrencyCode('eur')).toBe('EUR');
    expect(normalizeCurrencyCode('not-a-currency')).toBe(FALLBACK_CURRENCY);
  });

  it('reports zero-decimal currency metadata', () => {
    expect(getCurrencyFractionDigits('JPY')).toBe(0);
    expect(minorUnitFactor('KRW')).toBe(1);
  });

  it('falls back safely for non-Intl currency codes', () => {
    expect(getSafeCurrencyCode('US')).toBe(FALLBACK_CURRENCY);
    expect(getCurrencyMetadata('USD').decimalPlaces).toBe(2);
  });
});
