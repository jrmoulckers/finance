// SPDX-License-Identifier: BUSL-1.1

/**
 * Exchange rate type definitions and provider interface.
 *
 * Defines the contracts for pluggable exchange rate providers.
 * Any API backend (e.g., Open Exchange Rates, Fixer, ECB) can be
 * swapped in by implementing the `ExchangeRateProvider` interface.
 *
 * References: issue #1515
 */

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/**
 * A single exchange rate between two currencies.
 *
 * Rates are always expressed as "1 unit of `from` equals `rate` units of `to`".
 */
export interface ExchangeRate {
  /** ISO 4217 currency code for the source currency (e.g., "USD"). */
  readonly from: string;
  /** ISO 4217 currency code for the target currency (e.g., "EUR"). */
  readonly to: string;
  /** Conversion rate: 1 `from` = `rate` `to`. */
  readonly rate: number;
  /** ISO 8601 timestamp indicating when the rate was fetched or generated. */
  readonly timestamp: string;
  /** Source of the rate: "static", "stored", "api", or "user-override". */
  readonly source: 'static' | 'stored' | 'api' | 'user-override';
}

/**
 * Result of a currency conversion operation.
 */
export interface ConversionResult {
  /** The converted amount (in the smallest currency unit, e.g., cents). */
  readonly amount: number;
  /** The exchange rate used for the conversion. */
  readonly rate: ExchangeRate;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/**
 * Pluggable exchange rate provider.
 *
 * Implementations fetch rates from a specific source (static data, REST API,
 * WebSocket feed, etc.). The `ExchangeRateService` delegates to a provider
 * and adds caching on top.
 */
export interface ExchangeRateProvider {
  /** Human-readable name of the provider (e.g., "Static Rates", "Open Exchange Rates"). */
  readonly name: string;

  /**
   * Fetch all available rates for a base currency.
   *
   * @param baseCurrency - ISO 4217 code (e.g., "USD").
   * @returns A map of target currency codes to rates.
   */
  fetchRates(baseCurrency: string): Promise<Record<string, number>>;

  /**
   * Fetch the rate for a specific currency pair.
   *
   * @param from - Source currency code.
   * @param to - Target currency code.
   * @returns The conversion rate (1 `from` = `rate` `to`).
   */
  fetchRate(from: string, to: string): Promise<number>;

  /**
   * Check whether the provider is currently available.
   *
   * Useful for network-dependent providers that may be offline.
   */
  isAvailable(): Promise<boolean>;
}
