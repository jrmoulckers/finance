// SPDX-License-Identifier: BUSL-1.1

/**
 * Static exchange rate provider.
 *
 * Provides hardcoded exchange rates for ~30 major currencies relative to USD.
 * Rates are approximate snapshots and serve as a reliable offline fallback
 * when no live API provider is configured.
 *
 * Implements `ExchangeRateProvider` so it can be swapped for a live provider
 * without changing any consumer code.
 *
 * References: issue #1515
 */

import type { ExchangeRateProvider } from './exchange-rate-types';

// ---------------------------------------------------------------------------
// Static rates (USD base, approximate mid-market rates)
// ---------------------------------------------------------------------------

/**
 * Hardcoded rates: 1 USD = X units of target currency.
 *
 * These are approximate mid-market rates from a recent snapshot.
 * They are NOT suitable for real financial transactions — use a live
 * provider for that. They are useful for:
 *   - Offline display of approximate portfolio totals
 *   - Development / testing without API keys
 *   - Fallback when the live provider is unavailable
 */
export const STATIC_USD_RATES: Record<string, number> = {
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
  SGD: 1.34,
  HKD: 7.82,
  NOK: 10.65,
  SEK: 10.45,
  DKK: 6.87,
  NZD: 1.64,
  ZAR: 18.35,
  THB: 34.75,
  PHP: 55.8,
  MYR: 4.68,
  IDR: 15650.0,
  TWD: 31.2,
  PLN: 3.98,
  CZK: 22.85,
  HUF: 358.0,
  ILS: 3.65,
  AED: 3.673,
  SAR: 3.75,
};

/** All currency codes supported by the static provider. */
export const STATIC_CURRENCY_CODES = Object.keys(STATIC_USD_RATES);

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

/**
 * Exchange rate provider backed by hardcoded static rates.
 *
 * Always available (offline-safe) and returns "static" as the source.
 */
export class StaticRateProvider implements ExchangeRateProvider {
  readonly name = 'Static Rates';

  /**
   * Fetch all rates for a given base currency.
   *
   * Cross-rates are derived by dividing through the USD rate.
   */
  async fetchRates(baseCurrency: string): Promise<Record<string, number>> {
    const baseRate = STATIC_USD_RATES[baseCurrency];
    if (baseRate === undefined) {
      throw new Error(`Unsupported currency: ${baseCurrency}`);
    }

    const rates: Record<string, number> = {};
    for (const [code, usdRate] of Object.entries(STATIC_USD_RATES)) {
      if (code !== baseCurrency) {
        rates[code] = usdRate / baseRate;
      }
    }
    return rates;
  }

  /**
   * Fetch the rate for a specific currency pair.
   *
   * Returns `1` when `from === to`.
   */
  async fetchRate(from: string, to: string): Promise<number> {
    if (from === to) return 1;

    const fromRate = STATIC_USD_RATES[from];
    const toRate = STATIC_USD_RATES[to];

    if (fromRate === undefined) {
      throw new Error(`Unsupported currency: ${from}`);
    }
    if (toRate === undefined) {
      throw new Error(`Unsupported currency: ${to}`);
    }

    return toRate / fromRate;
  }

  /** Static provider is always available. */
  async isAvailable(): Promise<boolean> {
    return true;
  }
}
