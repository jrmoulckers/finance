// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for multi-currency support.
 *
 * Provides currency conversion, exchange rate display, and
 * multi-currency totals for the dashboard.
 *
 * Usage:
 * ```tsx
 * const { convert, formatAmount, rates, defaultCurrency } = useMultiCurrency();
 * ```
 *
 * References: issue #1075
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Currency } from '../kmp/bridge';
import { Currencies } from '../kmp/bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExchangeRate {
  readonly from: string;
  readonly to: string;
  readonly rate: number;
  readonly updatedAt: string;
  readonly source: string;
}

export interface CurrencyTotal {
  readonly currency: Currency;
  readonly totalCents: number;
  readonly convertedCents: number;
  readonly convertedCurrency: Currency;
}

export interface UseMultiCurrencyResult {
  /** The user's default (display) currency. */
  defaultCurrency: Currency;
  /** Set the default currency. */
  setDefaultCurrency: (currency: Currency) => void;
  /** All supported currencies. */
  supportedCurrencies: Currency[];
  /** Current exchange rates. */
  rates: ExchangeRate[];
  /** Whether rates are loading. */
  loading: boolean;
  /** Error message, or null. */
  error: string | null;
  /** Last time rates were updated. */
  lastUpdated: string | null;
  /** Convert an amount from one currency to another. */
  convert: (amountCents: number, from: Currency, to: Currency) => number;
  /** Format a cents amount with proper currency display. */
  formatAmount: (amountCents: number, currency: Currency) => string;
  /** Format with currency symbol. */
  formatWithSymbol: (amountCents: number, currency: Currency) => string;
  /** Get the exchange rate between two currencies. */
  getRate: (from: string, to: string) => number | null;
  /** Calculate totals across multiple currencies. */
  calculateMultiCurrencyTotal: (
    items: Array<{ amountCents: number; currency: Currency }>,
  ) => CurrencyTotal[];
  /** Refresh exchange rates. */
  refreshRates: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY_DEFAULT_CURRENCY = 'finance-default-currency';
const STORAGE_KEY_RATES = 'finance-exchange-rates';
const STORAGE_KEY_RATES_UPDATED = 'finance-exchange-rates-updated';

const SUPPORTED_CURRENCIES: Currency[] = [
  Currencies.USD,
  Currencies.EUR,
  Currencies.GBP,
  Currencies.JPY,
  Currencies.CAD,
  { code: 'AUD', decimalPlaces: 2 },
  { code: 'CHF', decimalPlaces: 2 },
  { code: 'CNY', decimalPlaces: 2 },
  { code: 'INR', decimalPlaces: 2 },
  { code: 'MXN', decimalPlaces: 2 },
  { code: 'BRL', decimalPlaces: 2 },
  { code: 'KRW', decimalPlaces: 0 },
];

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CAD: 'C$',
  AUD: 'A$',
  CHF: 'CHF',
  CNY: '¥',
  INR: '₹',
  MXN: 'MX$',
  BRL: 'R$',
  KRW: '₩',
};

/**
 * Static exchange rates (USD base).
 * In production, these would be fetched from an API.
 */
const STATIC_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 149.5,
  CAD: 1.36,
  AUD: 1.53,
  CHF: 0.88,
  CNY: 7.24,
  INR: 83.12,
  MXN: 17.15,
  BRL: 4.97,
  KRW: 1320.0,
};

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function loadDefaultCurrency(): Currency {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_DEFAULT_CURRENCY);
    if (stored) {
      const parsed = JSON.parse(stored) as Currency;
      if (parsed.code && typeof parsed.decimalPlaces === 'number') {
        return parsed;
      }
    }
  } catch {
    // Fall through to default
  }
  return Currencies.USD;
}

function buildRates(): ExchangeRate[] {
  const now = new Date().toISOString();
  const rates: ExchangeRate[] = [];

  const codes = Object.keys(STATIC_RATES);
  for (const from of codes) {
    for (const to of codes) {
      if (from !== to) {
        const fromRate = STATIC_RATES[from]!;
        const toRate = STATIC_RATES[to]!;
        rates.push({
          from,
          to,
          rate: toRate / fromRate,
          updatedAt: now,
          source: 'static',
        });
      }
    }
  }

  return rates;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMultiCurrency(): UseMultiCurrencyResult {
  const [defaultCurrency, setDefaultCurrencyState] = useState<Currency>(loadDefaultCurrency);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refreshRates = useCallback(() => {
    setLoading(true);
    setRefreshToken((t) => t + 1);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      const builtRates = buildRates();
      setRates(builtRates);
      const now = new Date().toISOString();
      setLastUpdated(now);
      localStorage.setItem(STORAGE_KEY_RATES, JSON.stringify(builtRates));
      localStorage.setItem(STORAGE_KEY_RATES_UPDATED, now);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load exchange rates.');
    } finally {
      setLoading(false);
    }
  }, [refreshToken]);

  const setDefaultCurrency = useCallback((currency: Currency) => {
    setDefaultCurrencyState(currency);
    localStorage.setItem(STORAGE_KEY_DEFAULT_CURRENCY, JSON.stringify(currency));
  }, []);

  const rateMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const rate of rates) {
      map.set(`${rate.from}-${rate.to}`, rate.rate);
    }
    return map;
  }, [rates]);

  const getRate = useCallback(
    (from: string, to: string): number | null => {
      if (from === to) return 1;
      return rateMap.get(`${from}-${to}`) ?? null;
    },
    [rateMap],
  );

  const convert = useCallback(
    (amountCents: number, from: Currency, to: Currency): number => {
      if (from.code === to.code) return amountCents;

      const rate = getRate(from.code, to.code);
      if (rate === null) return amountCents;

      return Math.round(amountCents * rate);
    },
    [getRate],
  );

  const formatAmount = useCallback((amountCents: number, currency: Currency): string => {
    const divisor = Math.pow(10, currency.decimalPlaces);
    return (amountCents / divisor).toFixed(currency.decimalPlaces);
  }, []);

  const formatWithSymbol = useCallback(
    (amountCents: number, currency: Currency): string => {
      const symbol = CURRENCY_SYMBOLS[currency.code] ?? currency.code;
      const formatted = formatAmount(amountCents, currency);
      return `${symbol}${formatted}`;
    },
    [formatAmount],
  );

  const calculateMultiCurrencyTotal = useCallback(
    (items: Array<{ amountCents: number; currency: Currency }>): CurrencyTotal[] => {
      const byCurrency = new Map<string, { currency: Currency; total: number }>();

      for (const item of items) {
        const existing = byCurrency.get(item.currency.code);
        if (existing) {
          existing.total += item.amountCents;
        } else {
          byCurrency.set(item.currency.code, {
            currency: item.currency,
            total: item.amountCents,
          });
        }
      }

      return Array.from(byCurrency.values()).map(({ currency, total }) => ({
        currency,
        totalCents: total,
        convertedCents: convert(total, currency, defaultCurrency),
        convertedCurrency: defaultCurrency,
      }));
    },
    [convert, defaultCurrency],
  );

  return {
    defaultCurrency,
    setDefaultCurrency,
    supportedCurrencies: SUPPORTED_CURRENCIES,
    rates,
    loading,
    error,
    lastUpdated,
    convert,
    formatAmount,
    formatWithSymbol,
    getRate,
    calculateMultiCurrencyTotal,
    refreshRates,
  };
}
