// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useMultiCurrency } from '../useMultiCurrency';
import { Currencies } from '../../kmp/bridge';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('useMultiCurrency', () => {
  it('defaults to USD', () => {
    const { result } = renderHook(() => useMultiCurrency());

    expect(result.current.defaultCurrency.code).toBe('USD');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('loads exchange rates without fabricating a freshness timestamp', () => {
    const { result } = renderHook(() => useMultiCurrency());

    expect(result.current.rates.length).toBeGreaterThan(0);
    // Static snapshot rates carry no live "as of" time, so the hook must not
    // stamp a misleading "updated now" timestamp (#3293).
    expect(result.current.lastUpdated).toBeNull();
    expect(result.current.rates.every((rate) => rate.updatedAt === null)).toBe(true);
    expect(result.current.rates.every((rate) => rate.source === 'static')).toBe(true);
  });

  it('converts USD to EUR', () => {
    const { result } = renderHook(() => useMultiCurrency());

    const converted = result.current.convert(10000, Currencies.USD, Currencies.EUR);

    // 1 USD = 0.92 EUR, so $100 = €92
    expect(converted).toBe(9200);
  });

  it('rescales minor units when converting to a zero-decimal currency (#3460)', () => {
    const { result } = renderHook(() => useMultiCurrency());

    // $100.00 = 10000 US cents (2 decimals). At 149.5 JPY/USD that is ¥14,950,
    // and JPY has 0 decimal places, so the minor-unit value is 14950 — NOT the
    // unscaled 1,495,000 that the pre-#3460 code produced.
    const converted = result.current.convert(10000, Currencies.USD, Currencies.JPY);
    expect(converted).toBe(14950);
  });

  it('round-trips USD -> JPY -> USD without a power-of-ten error (#3460)', () => {
    const { result } = renderHook(() => useMultiCurrency());

    const jpy = result.current.convert(10000, Currencies.USD, Currencies.JPY);
    expect(jpy).toBe(14950);

    const backToUsd = result.current.convert(jpy, Currencies.JPY, Currencies.USD);
    expect(backToUsd).toBe(10000);
  });

  it('leaves same-scale USD <-> EUR conversion unchanged (#3460 no regression)', () => {
    const { result } = renderHook(() => useMultiCurrency());

    // Both currencies use 2 decimals, so the rescale factor is 1.
    expect(result.current.convert(10000, Currencies.USD, Currencies.EUR)).toBe(9200);
  });

  it('returns same amount when converting to same currency', () => {
    const { result } = renderHook(() => useMultiCurrency());

    const converted = result.current.convert(5000, Currencies.USD, Currencies.USD);
    expect(converted).toBe(5000);
  });

  it('formats amount with correct decimals', () => {
    const { result } = renderHook(() => useMultiCurrency());

    expect(result.current.formatAmount(12345, Currencies.USD)).toBe('123.45');
    expect(result.current.formatAmount(12345, Currencies.JPY)).toBe('12,345');
  });

  it('formats with currency symbol', () => {
    const { result } = renderHook(() => useMultiCurrency());

    expect(result.current.formatWithSymbol(12345, Currencies.USD)).toBe('$123.45');
    expect(result.current.formatWithSymbol(12345, Currencies.EUR)).toBe('€123.45');
    expect(result.current.formatWithSymbol(12345, Currencies.GBP)).toBe('£123.45');
    expect(result.current.formatWithSymbol(12345, Currencies.JPY)).toBe('¥12,345');
  });

  it('gets exchange rate between currencies', () => {
    const { result } = renderHook(() => useMultiCurrency());

    const rate = result.current.getRate('USD', 'EUR');
    expect(rate).toBeCloseTo(0.92, 1);

    const sameRate = result.current.getRate('USD', 'USD');
    expect(sameRate).toBe(1);
  });

  it('returns null for unknown rate pair', () => {
    const { result } = renderHook(() => useMultiCurrency());

    const rate = result.current.getRate('XYZ', 'ABC');
    expect(rate).toBeNull();
  });

  it('sets default currency and persists it', () => {
    const { result, unmount } = renderHook(() => useMultiCurrency());

    act(() => {
      result.current.setDefaultCurrency(Currencies.EUR);
    });

    expect(result.current.defaultCurrency.code).toBe('EUR');

    unmount();

    const { result: result2 } = renderHook(() => useMultiCurrency());
    expect(result2.current.defaultCurrency.code).toBe('EUR');
  });

  it('calculates multi-currency totals', () => {
    const { result } = renderHook(() => useMultiCurrency());

    const items = [
      { amountCents: 10000, currency: Currencies.USD },
      { amountCents: 5000, currency: Currencies.EUR },
      { amountCents: 3000, currency: Currencies.USD },
    ];

    const totals = result.current.calculateMultiCurrencyTotal(items);

    // Should have 2 groups: USD and EUR
    expect(totals).toHaveLength(2);

    const usdTotal = totals.find((t) => t.currency.code === 'USD');
    expect(usdTotal?.totalCents).toBe(13000);

    const eurTotal = totals.find((t) => t.currency.code === 'EUR');
    expect(eurTotal?.totalCents).toBe(5000);
    // EUR converted to USD: 5000 / 0.92 ≈ 5435
    expect(eurTotal?.convertedCents).toBeGreaterThan(5000);
  });

  it('calculates a correct converted grand total including a zero-decimal JPY item (#3460)', () => {
    const { result } = renderHook(() => useMultiCurrency());

    // Default display currency is USD. $100.00 plus ¥14,950 (which is $100.00)
    // must convert to a $200.00 grand total — 20000 US cents — not a value
    // inflated ~100x by the missing minor-unit rescale.
    const totals = result.current.calculateMultiCurrencyTotal([
      { amountCents: 10000, currency: Currencies.USD },
      { amountCents: 14950, currency: Currencies.JPY },
    ]);

    const jpyTotal = totals.find((t) => t.currency.code === 'JPY');
    expect(jpyTotal?.convertedCents).toBe(10000);

    const grandTotalCents = totals.reduce((sum, t) => sum + t.convertedCents, 0);
    expect(grandTotalCents).toBe(20000);
  });

  it('falls back to USD when an unsupported default currency is stored', () => {
    localStorage.setItem(
      'finance-default-currency',
      JSON.stringify({ code: 'ZZZ', decimalPlaces: 2 }),
    );

    const { result } = renderHook(() => useMultiCurrency());

    expect(result.current.defaultCurrency.code).toBe('USD');
  });

  it('keeps zero-decimal currencies grouped without unsafe decimal conversion', () => {
    const { result } = renderHook(() => useMultiCurrency());
    const totals = result.current.calculateMultiCurrencyTotal([
      { amountCents: 1000, currency: Currencies.JPY },
      { amountCents: 250, currency: Currencies.JPY },
    ]);

    expect(totals).toHaveLength(1);
    expect(totals[0]?.totalCents).toBe(1250);
    expect(totals[0]?.currency.decimalPlaces).toBe(0);
  });

  it('provides list of supported currencies', () => {
    const { result } = renderHook(() => useMultiCurrency());

    expect(result.current.supportedCurrencies.length).toBeGreaterThanOrEqual(5);
    expect(result.current.supportedCurrencies.map((c) => c.code)).toContain('USD');
    expect(result.current.supportedCurrencies.map((c) => c.code)).toContain('EUR');
  });
});
