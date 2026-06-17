// SPDX-License-Identifier: BUSL-1.1

/**
 * Exchange rate service.
 *
 * Orchestrates exchange rate lookups by checking the cache first,
 * falling back to the configured provider, and supporting user-override
 * rates for manual rate entry.
 *
 * Usage:
 * ```ts
 * const service = new ExchangeRateService(); // defaults to StaticRateProvider
 * const result = await service.convert(10000, 'USD', 'EUR');
 * // result.amount = 9200, result.rate = { from: 'USD', to: 'EUR', rate: 0.92, ... }
 * ```
 *
 * References: issue #1515
 */

import type { ConversionResult, ExchangeRate, ExchangeRateProvider } from './exchange-rate-types';
import {
  getCachedRate,
  getCachedRates,
  isCacheStale,
  setCachedRate,
  setCachedRates,
} from './rate-cache';
import { LocalStoredRateProvider } from './local-stored-rate-provider';
import { StaticRateProvider } from './static-rates';

// ---------------------------------------------------------------------------
// User override storage
// ---------------------------------------------------------------------------

const USER_OVERRIDES_KEY = 'finance-exchange-rate-overrides';

/**
 * Read user-override rates from localStorage.
 *
 * Overrides are stored as a map of "FROM:TO" → rate number.
 */
function loadUserOverrides(): Record<string, number> {
  try {
    const raw = localStorage.getItem(USER_OVERRIDES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

/** Persist user-override rates to localStorage. */
function saveUserOverrides(overrides: Record<string, number>): void {
  try {
    localStorage.setItem(USER_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    // localStorage may be unavailable — fail silently
  }
}

/** Build a pair key for overrides. */
function overrideKey(from: string, to: string): string {
  return `${from}:${to}`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Exchange rate service with caching and user-override support.
 *
 * The resolution order for any rate lookup is:
 * 1. User override (manual rate entry)
 * 2. Fresh cache (localStorage with TTL)
 * 3. Provider (LocalStoredRateProvider by default)
 * 4. Stale cache fallback when the provider fails
 */
export class ExchangeRateService {
  private readonly provider: ExchangeRateProvider;
  private readonly cacheTtlMs: number;

  /**
   * @param provider - Exchange rate provider (default: `LocalStoredRateProvider`).
   * @param cacheTtlMs - Cache TTL in milliseconds (default: 24 hours).
   */
  constructor(provider?: ExchangeRateProvider, cacheTtlMs?: number) {
    this.provider = provider ?? new LocalStoredRateProvider();
    this.cacheTtlMs = cacheTtlMs ?? 24 * 60 * 60 * 1000;
  }

  /**
   * Convert an amount from one currency to another.
   *
   * @param amount - Amount in the smallest currency unit (e.g., cents).
   * @param from - Source currency code (ISO 4217).
   * @param to - Target currency code (ISO 4217).
   * @returns The converted amount and the rate used.
   */
  async convert(amount: number, from: string, to: string): Promise<ConversionResult> {
    if (from === to) {
      return {
        amount,
        rate: {
          from,
          to,
          rate: 1,
          timestamp: new Date().toISOString(),
          source: 'static',
        },
      };
    }

    const rate = await this.getRate(from, to);
    return {
      amount: Math.round(amount * rate.rate),
      rate,
    };
  }

  /**
   * Get the exchange rate for a specific currency pair.
   *
   * Resolution order: user override → cache → provider.
   */
  async getRate(from: string, to: string): Promise<ExchangeRate> {
    if (from === to) {
      return {
        from,
        to,
        rate: 1,
        timestamp: new Date().toISOString(),
        source: 'static',
      };
    }

    // 1. Check user overrides
    const overrides = loadUserOverrides();
    const userRate = overrides[overrideKey(from, to)];
    if (userRate !== undefined) {
      return {
        from,
        to,
        rate: userRate,
        timestamp: new Date().toISOString(),
        source: 'user-override',
      };
    }

    // 2. Check cache (if not stale)
    const cached = getCachedRate(from, to);
    if (!isCacheStale(this.cacheTtlMs) && cached) {
     return cached;
    }

    // 3. Fetch from provider, falling back to stale cache on failure.
    try {
     const rate = await this.provider.fetchRate(from, to);
     const exchangeRate: ExchangeRate = {
       from,
       to,
       rate,
       timestamp: new Date().toISOString(),
       source: this.providerSource,
     };

     // Cache for future lookups
     setCachedRate(exchangeRate);

     return exchangeRate;
    } catch (err) {
     if (cached) return cached;
     throw err;
    }
  }

  /**
   * Get all exchange rates for a base currency.
   *
   * Resolution order: cache → provider. User overrides are merged on top.
   */
  async getAllRates(baseCurrency: string): Promise<Record<string, ExchangeRate>> {
    let rates: Record<string, ExchangeRate>;

    // Try cache first (if not stale)
    const cached = getCachedRates(baseCurrency);

    if (!isCacheStale(this.cacheTtlMs) && cached) {
      rates = cached;
    } else {
      try {
        // Fetch from provider
        const rawRates = await this.provider.fetchRates(baseCurrency);
        const now = new Date().toISOString();
        const source = this.providerSource;

        rates = {};
        for (const [code, rate] of Object.entries(rawRates)) {
          rates[code] = {
            from: baseCurrency,
            to: code,
            rate,
            timestamp: now,
            source,
          };
        }

        // Persist to cache
        setCachedRates(baseCurrency, rates);
      } catch (err) {
        if (cached) {
          rates = cached;
        } else {
          throw err;
        }
      }
    }

    // Merge user overrides on top
    const overrides = loadUserOverrides();
    for (const [key, userRate] of Object.entries(overrides)) {
      const [from, to] = key.split(':');
      if (from === baseCurrency && to) {
        rates[to] = {
          from: baseCurrency,
          to,
          rate: userRate,
          timestamp: new Date().toISOString(),
          source: 'user-override',
        };
      }
    }

    return rates;
  }

  // -------------------------------------------------------------------------
  // User overrides
  // -------------------------------------------------------------------------

  /**
   * Set a user-override rate for a currency pair.
   *
   * Overrides take highest priority in all rate lookups.
   */
  setUserOverride(from: string, to: string, rate: number): void {
    const overrides = loadUserOverrides();
    overrides[overrideKey(from, to)] = rate;
    saveUserOverrides(overrides);
  }

  /**
   * Remove a user-override rate for a currency pair.
   */
  removeUserOverride(from: string, to: string): void {
    const overrides = loadUserOverrides();
    delete overrides[overrideKey(from, to)];
    saveUserOverrides(overrides);
  }

  /**
   * Get all active user-override rates.
   */
  getUserOverrides(): Record<string, number> {
    return loadUserOverrides();
  }

  /**
   * Clear all user-override rates.
   */
  clearUserOverrides(): void {
    saveUserOverrides({});
  }

  /** Get the provider name. */
  get providerName(): string {
    return this.provider.name;
  }

  private get providerSource(): ExchangeRate['source'] {
    if (this.provider instanceof StaticRateProvider) return 'static';
    if (this.provider instanceof LocalStoredRateProvider) return 'stored';
    return 'api';
  }
}
