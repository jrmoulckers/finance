// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { Currencies, cents, centsFromDollars, formatCents } from './bridge';
import type { Currency } from './bridge';

/**
 * Comprehensive integer cents arithmetic edge case tests for the KMP bridge.
 * Mirrors the Kotlin-side CentsArithmeticEdgeCaseTest for parity.
 *
 * Issues: #1366, #1372
 */

describe('cents()', () => {
  it('creates cents from integer', () => {
    expect(cents(100).amount).toBe(100);
  });

  it('truncates fractional input', () => {
    expect(cents(100.7).amount).toBe(100);
    expect(cents(100.3).amount).toBe(100);
  });

  it('handles zero', () => {
    expect(cents(0).amount).toBe(0);
  });

  it('handles negative', () => {
    expect(cents(-500).amount).toBe(-500);
  });

  it('handles large int32 boundary', () => {
    // Int32 max: 2,147,483,647 cents = $21,474,836.47
    expect(cents(2_147_483_647).amount).toBe(2_147_483_647);
  });

  it('handles values beyond int32 within JS safe integer range', () => {
    // JS Number.MAX_SAFE_INTEGER = 9,007,199,254,740,991
    expect(cents(10_000_000_000).amount).toBe(10_000_000_000);
  });

  it('handles negative truncation', () => {
    // Math.trunc(-100.7) = -100
    expect(cents(-100.7).amount).toBe(-100);
  });
});

describe('centsFromDollars()', () => {
  it('converts whole dollars', () => {
    expect(centsFromDollars(100).amount).toBe(10000);
  });

  it('converts with decimal cents', () => {
    expect(centsFromDollars(12.5).amount).toBe(1250);
  });

  it('handles zero', () => {
    expect(centsFromDollars(0).amount).toBe(0);
  });

  it('handles negative', () => {
    expect(centsFromDollars(-5).amount).toBe(-500);
  });

  it('handles $19.99 floating-point precision', () => {
    // 19.99 * 100 = 1998.9999999999998 in IEEE 754
    // Math.round should give 1999
    expect(centsFromDollars(19.99).amount).toBe(1999);
  });

  it('handles $9.99 floating-point precision', () => {
    expect(centsFromDollars(9.99).amount).toBe(999);
  });

  it('handles $0.01', () => {
    expect(centsFromDollars(0.01).amount).toBe(1);
  });

  it('handles $0.10', () => {
    expect(centsFromDollars(0.1).amount).toBe(10);
  });

  it('handles large dollar amount', () => {
    expect(centsFromDollars(1_000_000).amount).toBe(100_000_000);
  });

  it('handles $99.99 (common price point)', () => {
    expect(centsFromDollars(99.99).amount).toBe(9999);
  });

  it('handles $49.95', () => {
    expect(centsFromDollars(49.95).amount).toBe(4995);
  });
});

describe('formatCents()', () => {
  it('formats USD positive amount', () => {
    expect(formatCents(cents(10000), Currencies.USD)).toBe('100.00 USD');
  });

  it('formats USD zero', () => {
    expect(formatCents(cents(0), Currencies.USD)).toBe('0.00 USD');
  });

  it('formats USD negative', () => {
    expect(formatCents(cents(-500), Currencies.USD)).toBe('-5.00 USD');
  });

  it('formats USD one cent', () => {
    expect(formatCents(cents(1), Currencies.USD)).toBe('0.01 USD');
  });

  it('formats JPY (0 decimal places)', () => {
    expect(formatCents(cents(1500), Currencies.JPY)).toBe('1500 JPY');
  });

  it('formats EUR', () => {
    expect(formatCents(cents(9200), Currencies.EUR)).toBe('92.00 EUR');
  });

  it('formats large amount', () => {
    expect(formatCents(cents(100_000_000), Currencies.USD)).toBe('1000000.00 USD');
  });

  it('formats 3-decimal currency (e.g., BHD)', () => {
    const bhd: Currency = { code: 'BHD', decimalPlaces: 3 };
    expect(formatCents(cents(1500), bhd)).toBe('1.500 BHD');
  });
});

describe('integer cents arithmetic edge cases', () => {
  describe('basic arithmetic', () => {
    it('addition', () => {
      const a = cents(100);
      const b = cents(200);
      expect(a.amount + b.amount).toBe(300);
    });

    it('subtraction producing negative', () => {
      expect(cents(200).amount - cents(300).amount).toBe(-100);
    });

    it('multiplication by integer', () => {
      expect(cents(100).amount * 3).toBe(300);
    });
  });

  describe('negative amounts', () => {
    it('expense is negative', () => {
      const expense = cents(-4999);
      expect(expense.amount).toBeLessThan(0);
    });

    it('refund restores balance', () => {
      const balance = 10000; // $100.00
      const expense = -2500; // -$25.00
      const refund = 2500; // +$25.00
      expect(balance + expense + refund).toBe(10000);
    });

    it('overdraft goes negative', () => {
      const balance = 500;
      const expense = -1000;
      expect(balance + expense).toBe(-500);
    });
  });

  describe('zero amounts', () => {
    it('zero is identity for addition', () => {
      expect(cents(12345).amount + 0).toBe(12345);
    });

    it('zero times anything is zero', () => {
      expect(0 * 999).toBe(0);
    });
  });

  describe('large amounts', () => {
    it('int32 max is representable', () => {
      const max32 = 2_147_483_647;
      expect(cents(max32).amount).toBe(max32);
    });

    it('beyond int32 is representable in JS', () => {
      // $100 billion = 10 trillion cents — still safe integer
      const amount = 10_000_000_000_000;
      expect(Number.isSafeInteger(amount)).toBe(true);
      expect(cents(amount).amount).toBe(amount);
    });

    it('MAX_SAFE_INTEGER is the JS boundary', () => {
      expect(Number.isSafeInteger(Number.MAX_SAFE_INTEGER)).toBe(true);
      expect(Number.isSafeInteger(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    });
  });

  describe('split calculations', () => {
    it('$10.00 among 3 — remainder handling', () => {
      const total = 1000;
      const parts = 3;
      const base = Math.floor(total / parts); // 333
      const remainder = total % parts; // 1

      const shares = Array.from({ length: parts }, (_, i) => (i < remainder ? base + 1 : base));

      expect(shares).toEqual([334, 333, 333]);
      expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
    });

    it('$87.53 among 4 — remainder handling', () => {
      const total = 8753;
      const parts = 4;
      const base = Math.floor(total / parts); // 2188
      const remainder = total % parts; // 1

      const shares = Array.from({ length: parts }, (_, i) => (i < remainder ? base + 1 : base));

      expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
      expect(shares[0]).toBe(2189);
      expect(shares[1]).toBe(2188);
    });

    it('1 cent among 10 — only first gets it', () => {
      const total = 1;
      const parts = 10;
      const base = Math.floor(total / parts); // 0
      const remainder = total % parts; // 1

      const shares = Array.from({ length: parts }, (_, i) => (i < remainder ? base + 1 : base));

      expect(shares.filter((s) => s === 1)).toHaveLength(1);
      expect(shares.filter((s) => s === 0)).toHaveLength(9);
      expect(shares.reduce((a, b) => a + b, 0)).toBe(1);
    });
  });

  describe('percentage / tax calculations', () => {
    it('7.25% tax on $99.99', () => {
      // 9999 * 0.0725 = 724.9275 → Math.round = 725
      const tax = Math.round(9999 * 0.0725);
      expect(tax).toBe(725);
    });

    it('8.875% tax on $49.99', () => {
      // 4999 * 0.08875 = 443.66125 → Math.round = 444
      const tax = Math.round(4999 * 0.08875);
      expect(tax).toBe(444);
    });

    it('subtotal plus tax', () => {
      const subtotal = 9999;
      const tax = Math.round(subtotal * 0.0725); // 725
      expect(subtotal + tax).toBe(10724);
    });

    it('15% discount on $200.00', () => {
      const price = 20000;
      const discount = Math.round(price * 0.15);
      expect(discount).toBe(3000);
      expect(price - discount).toBe(17000);
    });
  });

  describe('currency conversion', () => {
    it('USD to EUR at 0.92', () => {
      const usd = 10000; // $100.00
      const eur = Math.round(usd * 0.92);
      expect(eur).toBe(9200);
    });

    it('USD to JPY at 149.50', () => {
      const usd = 10000;
      const jpy = Math.round(usd * 149.5);
      expect(jpy).toBe(1_495_000);
    });

    it('1 cent converted — rounding matters', () => {
      expect(Math.round(1 * 0.92)).toBe(1); // 0.92 rounds to 1
      expect(Math.round(1 * 0.49)).toBe(0); // 0.49 rounds to 0
    });

    it('round-trip conversion within 1 cent tolerance', () => {
      const original = 10000;
      const rate = 0.92;
      const converted = Math.round(original * rate); // 9200
      const backToOriginal = Math.round(converted * (1.0 / rate));
      expect(Math.abs(original - backToOriginal)).toBeLessThanOrEqual(1);
    });
  });

  describe('budget rollover', () => {
    it('unused budget carries forward', () => {
      const base = 50000;
      const spent = 35000;
      const unused = base - spent; // 15000
      const next = base + Math.max(unused, 0);
      expect(next).toBe(65000);
    });

    it('over-budget does not carry negative', () => {
      const base = 50000;
      const spent = 60000;
      const unused = base - spent; // -10000
      const next = base + Math.max(unused, 0);
      expect(next).toBe(50000);
    });

    it('exact budget — no change', () => {
      const base = 50000;
      const spent = 50000;
      const unused = base - spent;
      const next = base + Math.max(unused, 0);
      expect(next).toBe(50000);
    });

    it('no spending — doubles budget', () => {
      const base = 50000;
      const unused = base;
      const next = base + Math.max(unused, 0);
      expect(next).toBe(100000);
    });
  });
});
