// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { formatBidiFinancialSummary, isolateCurrencyCode, isolateFinancialTokens } from './bidi-financial';

describe('bidi-financial', () => {
  it('isolates currency amounts and account identifiers for RTL text', () => {
    expect(formatBidiFinancialSummary({ currencyCode: 'usd', amount: '123.45', accountName: 'Visa 1234' })).toBe(
      '\u2068USD\u2069 \u2068123.45\u2069 \u2068Visa 1234\u2069',
    );
    expect(isolateCurrencyCode('eur')).toBe('\u2068EUR\u2069');
  });

  it('isolates mixed-direction financial tokens inside localized sentences', () => {
    expect(isolateFinancialTokens('رصيد USD 1,234.50')).toBe('رصيد \u2068USD\u2069 \u20681,234.50\u2069');
  });
});
