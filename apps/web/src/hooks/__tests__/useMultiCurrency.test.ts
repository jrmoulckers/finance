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

  it('loads exchange rates', () => {
    const { result } = renderHook(() => useMultiCurrency());

    expect(result.current.rates.length).toBeGreaterThan(0);
    expect(result.current.lastUpdated).not.toBeNull();
  });

  it('converts USD to EUR', () => {
    const { result } = renderHook(() => useMultiCurrency());

    const converted = result.current.convert(10000, Currencies.USD, Currencies.EUR);

    // 1 USD = 0.92 EUR, so $100 = €92
    expect(converted).toBe(9200);
  });

  it('returns same amount when converting to same currency', () => {
    const { result } = renderHook(() => useMultiCurrency());

    const converted = result.current.convert(5000, Currencies.USD, Currencies.USD);
    expect(converted).toBe(5000);
  });

  it('formats amount with correct decimals', () => {
    const { result } = renderHook(() => useMultiCurrency());

    expect(result.current.formatAmount(12345, Currencies.USD)).toBe('123.45');
    expect(result.current.formatAmount(12345, Currencies.JPY)).toBe('12345');
  });

  it('formats with currency symbol', () => {
    const { result } = renderHook(() => useMultiCurrency());

    expect(result.current.formatWithSymbol(12345, Currencies.USD)).toBe('$123.45');
    expect(result.current.formatWithSymbol(12345, Currencies.EUR)).toBe('€123.45');
    expect(result.current.formatWithSymbol(12345, Currencies.GBP)).toBe('£123.45');
    expect(result.current.formatWithSymbol(12345, Currencies.JPY)).toBe('¥12345');
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

  it('provides list of supported currencies', () => {
    const { result } = renderHook(() => useMultiCurrency());

    expect(result.current.supportedCurrencies.length).toBeGreaterThanOrEqual(5);
    expect(result.current.supportedCurrencies.map((c) => c.code)).toContain('USD');
    expect(result.current.supportedCurrencies.map((c) => c.code)).toContain('EUR');
  });
});
