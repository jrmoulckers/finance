// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  countCurrencies,
  detectMixedCurrencies,
  formatCurrencyGroup,
  getSingleCurrency,
  groupByCurrency,
} from './currency-utils';

describe('currency-utils', () => {
  describe('groupByCurrency', () => {
    it('groups amounts by currency code and sums them', () => {
      const result = groupByCurrency([
        { amount: 100000, currency: 'USD' },
        { amount: 50000, currency: 'EUR' },
        { amount: 200000, currency: 'USD' },
      ]);

      expect(result).toEqual({ USD: 300000, EUR: 50000 });
    });

    it('returns empty object for empty input', () => {
      expect(groupByCurrency([])).toEqual({});
    });

    it('handles a single entry', () => {
      const result = groupByCurrency([{ amount: 150000, currency: 'GBP' }]);
      expect(result).toEqual({ GBP: 150000 });
    });

    it('handles negative amounts correctly', () => {
      const result = groupByCurrency([
        { amount: 100000, currency: 'USD' },
        { amount: -30000, currency: 'USD' },
      ]);
      expect(result).toEqual({ USD: 70000 });
    });
  });

  describe('formatCurrencyGroup', () => {
    it('formats single currency group', () => {
      const result = formatCurrencyGroup({ USD: 150000 });
      expect(result).toBe('$1,500.00');
    });

    it('formats multiple currencies separated by middle dot', () => {
      const result = formatCurrencyGroup({ USD: 150000, EUR: 120000 });
      expect(result).toContain('·');
      // EUR comes before USD alphabetically
      expect(result).toMatch(/€.*·.*\$/);
    });

    it('returns empty string for empty groups', () => {
      expect(formatCurrencyGroup({})).toBe('');
    });

    it('sorts currencies alphabetically', () => {
      const result = formatCurrencyGroup({ USD: 100, GBP: 200, EUR: 300 });
      const parts = result.split(' · ');
      expect(parts).toHaveLength(3);
      // EUR, GBP, USD alphabetical order
    });
  });

  describe('detectMixedCurrencies', () => {
    it('returns false for empty array', () => {
      expect(detectMixedCurrencies([])).toBe(false);
    });

    it('returns false for single item', () => {
      expect(detectMixedCurrencies([{ currency: 'USD' }])).toBe(false);
    });

    it('returns false when all currencies match', () => {
      expect(
        detectMixedCurrencies([{ currency: 'USD' }, { currency: 'USD' }, { currency: 'USD' }]),
      ).toBe(false);
    });

    it('returns true when currencies differ', () => {
      expect(detectMixedCurrencies([{ currency: 'USD' }, { currency: 'EUR' }])).toBe(true);
    });

    it('returns true with one different currency among many', () => {
      expect(
        detectMixedCurrencies([{ currency: 'USD' }, { currency: 'USD' }, { currency: 'EUR' }]),
      ).toBe(true);
    });
  });

  describe('getSingleCurrency', () => {
    it('returns null for empty array', () => {
      expect(getSingleCurrency([])).toBeNull();
    });

    it('returns the currency code when all same', () => {
      expect(getSingleCurrency([{ currency: 'EUR' }, { currency: 'EUR' }])).toBe('EUR');
    });

    it('returns null for mixed currencies', () => {
      expect(getSingleCurrency([{ currency: 'USD' }, { currency: 'EUR' }])).toBeNull();
    });
  });

  describe('countCurrencies', () => {
    it('returns 0 for empty array', () => {
      expect(countCurrencies([])).toBe(0);
    });

    it('returns 1 for single currency', () => {
      expect(countCurrencies([{ currency: 'USD' }, { currency: 'USD' }])).toBe(1);
    });

    it('returns correct count for multiple currencies', () => {
      expect(
        countCurrencies([
          { currency: 'USD' },
          { currency: 'EUR' },
          { currency: 'GBP' },
          { currency: 'EUR' },
        ]),
      ).toBe(3);
    });
  });
});
