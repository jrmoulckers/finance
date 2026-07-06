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
import { formatCurrency } from '../lib/currency';
import { STATIC_USD_RATES } from '../lib/currency/static-rates';
import { SUPPORTED_CURRENCY_METADATA } from '../lib/currency-metadata';
import { getCurrentLocale } from '../lib/i18n';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExchangeRate {
  readonly from: string;
  readonly to: string;
  readonly rate: number;
  /**
   * ISO timestamp of when the rate was fetched, or `null` for offline
   * static-snapshot rates that have no meaningful "as of" time.
   */
  readonly updatedAt: string | null;
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

const SUPPORTED_CURRENCIES: Currency[] = SUPPORTED_CURRENCY_METADATA.map(
  ({ code, decimalPlaces }) => ({
    code,
    decimalPlaces,
  }),
);

const SUPPORTED_CURRENCY_CODES = new Set(SUPPORTED_CURRENCIES.map((currency) => currency.code));

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function loadDefaultCurrency(): Currency {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_DEFAULT_CURRENCY);
    if (stored) {
      const parsed = JSON.parse(stored) as Currency;
      if (
        parsed.code &&
        typeof parsed.decimalPlaces === 'number' &&
        SUPPORTED_CURRENCY_CODES.has(parsed.code)
      ) {
        return parsed;
      }
    }
  } catch {
    // Fall through to default
  }
  return Currencies.USD;
}

/**
 * Build all cross-currency pairs from the shared static USD-base table.
 *
 * Rates come from the single canonical {@link STATIC_USD_RATES} snapshot
 * (shared with `StaticRateProvider`) so there is no second table to drift.
 * `updatedAt` is deliberately `null`: these are approximate offline
 * reference rates, not live quotes, and stamping "now" would misrepresent
 * them as freshly fetched.
 */
function buildRates(): ExchangeRate[] {
  const rates: ExchangeRate[] = [];

  const codes = Object.keys(STATIC_USD_RATES);
  for (const from of codes) {
    for (const to of codes) {
      if (from !== to) {
        const fromRate = STATIC_USD_RATES[from]!;
        const toRate = STATIC_USD_RATES[to]!;
        rates.push({
          from,
          to,
          rate: toRate / fromRate,
          updatedAt: null,
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
      // Static snapshot rates have no live "as of" time; do not fabricate one.
      setLastUpdated(null);
      localStorage.setItem(STORAGE_KEY_RATES, JSON.stringify(builtRates));
      localStorage.removeItem(STORAGE_KEY_RATES_UPDATED);
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

      // `amountCents` is in the source currency's minor units, but the rate
      // converts *major* units (e.g. 1 USD = 149.5 JPY). Rescale by the
      // minor-unit delta so converting to/from currencies with a different
      // number of decimal places — notably the zero-decimal JPY/KRW — is not
      // off by a power of ten (#3460).
      const scaleFactor = Math.pow(10, to.decimalPlaces - from.decimalPlaces);
      return Math.round(amountCents * rate * scaleFactor);
    },
    [getRate],
  );

  const formatAmount = useCallback((amountCents: number, currency: Currency): string => {
    const divisor = Math.pow(10, currency.decimalPlaces);
    return new Intl.NumberFormat(getCurrentLocale(), {
      minimumFractionDigits: currency.decimalPlaces,
      maximumFractionDigits: currency.decimalPlaces,
    }).format(amountCents / divisor);
  }, []);

  const formatWithSymbol = useCallback((amountCents: number, currency: Currency): string => {
    return formatCurrency(amountCents, { currency: currency.code, locale: getCurrentLocale() });
  }, []);

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
