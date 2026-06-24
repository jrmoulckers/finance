// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for useDisplayCurrencyRollup — wiring the display-currency rollup
 * engine to the shared preference + live exchange rates, and the end-to-end
 * propagation of a display-currency change through the shared money formatter.
 *
 * Per project conventions these tests mock the data HOOK (useExchangeRates),
 * not the underlying repositories/services. The display-currency preference
 * hook is exercised for real so persistence + propagation are covered.
 *
 * References: issue #2203
 */

import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

vi.mock('./useExchangeRates', () => ({ useExchangeRates: vi.fn() }));

import { useExchangeRates } from './useExchangeRates';
import type { UseExchangeRatesResult } from './useExchangeRates';
import type { ExchangeRate } from '../lib/currency/exchange-rate-types';
import { useDisplayCurrency } from './useDisplayCurrency';
import { useDisplayCurrencyRollup } from './useDisplayCurrencyRollup';
import { CurrencyDisplay } from '../components/common/CurrencyDisplay';
import { ConvertedTotalIndicator } from '../components/common/ConvertedTotalIndicator';

function rate(from: string, to: string, value: number): ExchangeRate {
  return { from, to, rate: value, timestamp: '2025-06-01T00:00:00Z', source: 'api' };
}

// Controlled rate tables keyed by base currency (1 base = rate target).
const RATE_MAPS: Record<string, Record<string, ExchangeRate>> = {
  USD: {
    USD: rate('USD', 'USD', 1),
    EUR: rate('USD', 'EUR', 0.5), // 1 USD = 0.5 EUR  => 1 EUR = 2 USD
    MXN: rate('USD', 'MXN', 10), // 1 USD = 10 MXN   => 1 MXN = 0.1 USD
    JPY: rate('USD', 'JPY', 100), // 1 USD = 100 JPY (0-decimal currency)
  },
  EUR: {
    EUR: rate('EUR', 'EUR', 1),
    USD: rate('EUR', 'USD', 2), // 1 EUR = 2 USD
  },
};

function mockExchangeRates(base: string, overrides: Partial<UseExchangeRatesResult> = {}): void {
  vi.mocked(useExchangeRates).mockImplementation(
    (requestedBase?: string) =>
      ({
        rates: RATE_MAPS[(requestedBase ?? base).toUpperCase()] ?? RATE_MAPS.USD,
        loading: false,
        error: null,
        lastUpdated: '2025-06-01T00:00:00Z',
        providerName: 'Mock',
        isOffline: false,
        isStale: false,
        hasManualOverrides: false,
        convert: vi.fn(),
        getRate: vi.fn(),
        setOverride: vi.fn(),
        removeOverride: vi.fn(),
        overrides: {},
        clearOverrides: vi.fn(),
        refresh: vi.fn(),
        ...overrides,
      }) as unknown as UseExchangeRatesResult,
  );
}

describe('useDisplayCurrencyRollup', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockExchangeRates('USD');
  });

  it('converts mixed currencies into the display currency with exact minor units', () => {
    const amounts = [
      { id: 'usd', amountCents: 100_00, currency: 'USD' },
      { id: 'eur', amountCents: 100_00, currency: 'EUR' }, // 1 EUR = 2 USD => $200
      { id: 'mxn', amountCents: 1_000_00, currency: 'MXN' }, // 1 MXN = 0.1 USD => $100
    ];

    const { result } = renderHook(() => useDisplayCurrencyRollup(amounts));

    expect(result.current.displayCurrency).toBe('USD');
    expect(result.current.rollup.totalCents).toBe(400_00);
    expect(result.current.rollup.convertedCurrencyCodes).toEqual(['EUR', 'MXN']);
    expect(result.current.isConverted).toBe(true);
    expect(result.current.unconvertedCurrencies).toEqual([]);
  });

  it('rescales zero-decimal currencies through the hook (JPY -> USD)', () => {
    const { result } = renderHook(() =>
      useDisplayCurrencyRollup([{ id: 'tokyo', amountCents: 10_000, currency: 'JPY' }]),
    );

    // ¥10,000 at 100 JPY/USD = $100.00 = 10_000 USD cents.
    expect(result.current.rollup.totalCents).toBe(100_00);
  });

  it('flags stale/offline rates so the UI can disclose them', () => {
    mockExchangeRates('USD', { isOffline: true });

    const { result } = renderHook(() =>
      useDisplayCurrencyRollup([{ id: 'eur', amountCents: 100_00, currency: 'EUR' }]),
    );

    expect(result.current.isOffline).toBe(true);
    expect(result.current.hasStaleRates).toBe(true);
    expect(result.current.rollup.hasStaleRates).toBe(true);
    expect(result.current.rollup.disclosure).toContain('stale or offline');
  });

  it('excludes (but reports) currencies with no available rate', () => {
    const amounts = [
      { id: 'usd', amountCents: 100_00, currency: 'USD' },
      { id: 'unknown', amountCents: 50_00, currency: 'ZZZ' },
    ];

    const { result } = renderHook(() => useDisplayCurrencyRollup(amounts));

    expect(result.current.rollup.totalCents).toBe(100_00); // ZZZ excluded
    expect(result.current.unconvertedCurrencies).toEqual(['ZZZ']);
    expect(result.current.isConverted).toBe(true);
  });
});

describe('display-currency change propagates through the shared formatter', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockExchangeRates('USD');
  });

  function Harness(): React.ReactElement {
    const { displayCurrency, setDisplayCurrency, supportedCurrencies } = useDisplayCurrency();
    const { rollup, isConverted, hasStaleRates } = useDisplayCurrencyRollup([
      { id: 'usd', amountCents: 100_00, currency: 'USD' },
      { id: 'eur', amountCents: 100_00, currency: 'EUR' },
    ]);

    return (
      <div>
        <label htmlFor="ccy">Display currency</label>
        <select
          id="ccy"
          value={displayCurrency}
          onChange={(event) => setDisplayCurrency(event.target.value)}
        >
          {supportedCurrencies.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span data-testid="total">
          <CurrencyDisplay amount={rollup.totalCents} currency={rollup.displayCurrency} />
        </span>
        <ConvertedTotalIndicator
          displayCurrency={rollup.displayCurrency}
          isConverted={isConverted}
          isStale={hasStaleRates}
          convertedCurrencies={rollup.convertedCurrencyCodes}
        />
      </div>
    );
  }

  it('recomputes and re-formats the converted total when the picker changes', () => {
    render(<Harness />);

    // Display USD: $100 (USD) + €100 -> $200 = $300.00, with a converted note.
    const total = screen.getByTestId('total');
    expect(total.textContent).toContain('300.00');
    expect(total.textContent).toContain('$');
    expect(screen.getByText('Converted EUR to USD')).toBeTruthy();

    // Switch the shared preference to EUR via the picker.
    mockExchangeRates('EUR');
    fireEvent.change(screen.getByLabelText('Display currency'), { target: { value: 'EUR' } });

    // Display EUR: €100 + $100 -> €50 = €150.00, now converting USD instead.
    expect(total.textContent).toContain('150.00');
    expect(total.textContent).toContain('€');
    expect(screen.getByText('Converted USD to EUR')).toBeTruthy();
  });
});
