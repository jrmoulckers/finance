// SPDX-License-Identifier: BUSL-1.1

/**
 * Bridges the (previously unwired) display-currency rollup engine to live data:
 * the shared display-currency preference + the existing exchange-rate
 * primitives. This is the hook pages call through the shared money formatter so
 * dashboard summaries, analytics, and budget rollups are converted into the
 * user's chosen display currency instead of being hardcoded to USD.
 *
 * Design notes:
 *   - Imports the rollup engine directly from its module (not the budgeting
 *     barrel) so this widely-shared hook stays tree-shakeable and does not pull
 *     the entire advanced-budgeting tree into route chunks.
 *   - All amounts are INTEGER minor units end-to-end; conversion + rounding
 *     happen inside the pure engine, never with floats here.
 *   - Rates that cannot satisfy a conversion are surfaced (not silently
 *     dropped) so the UI can disclose partial coverage.
 *   - Offline / stale rate state from `useExchangeRates` is folded into the
 *     rollup so a "converted — rates may be stale" indicator can be shown.
 *
 * References: issue #2203
 */

import { useMemo } from 'react';

import type { ExchangeRate } from '../lib/currency/exchange-rate-types';
import {
  aggregateDisplayCurrencyAmounts,
  type DisplayCurrencyAmount,
  type DisplayCurrencyRollup,
  type DisplayExchangeRate,
} from '../lib/budgeting/display-currency-rollups';
import { useDisplayCurrency } from './useDisplayCurrency';
import { useExchangeRates } from './useExchangeRates';

/** Options forwarded to {@link useDisplayCurrencyRollup}. */
export interface UseDisplayCurrencyRollupOptions {
  /**
   * Rates whose `timestamp` is older than this ISO 8601 instant are flagged as
   * stale in the resulting rollup (in addition to any offline detection).
   */
  readonly staleAfter?: string;
}

/** Result of {@link useDisplayCurrencyRollup}. */
export interface UseDisplayCurrencyRollupResult {
  /** The currency the totals are presented in. */
  readonly displayCurrency: string;
  /** Converted, summed rollup (totals in display-currency minor units). */
  readonly rollup: DisplayCurrencyRollup;
  /** `true` when at least one amount was converted from another currency. */
  readonly isConverted: boolean;
  /** `true` when rate requests have degraded due to connectivity. */
  readonly isOffline: boolean;
  /** `true` when the displayed rates came from an expired cache snapshot. */
  readonly isStale: boolean;
  /** `true` when any converted rate is stale or offline. */
  readonly hasStaleRates: boolean;
  /** ISO 8601 timestamp of the last successful rate update, if known. */
  readonly lastUpdated: string | null;
  /** `true` while exchange rates are still loading. */
  readonly loading: boolean;
  /** Currencies with no available rate to the display currency (excluded from the total). */
  readonly unconvertedCurrencies: readonly string[];
}

function toDisplayRate(rate: ExchangeRate, offline: boolean): DisplayExchangeRate {
  return {
    from: rate.from,
    to: rate.to,
    rate: rate.rate,
    timestamp: rate.timestamp,
    // When connectivity has degraded we mark every rate offline so the engine
    // flags the whole rollup as potentially stale, regardless of cached source.
    source: offline ? 'offline' : rate.source,
  };
}

/**
 * Convert and aggregate a set of minor-unit amounts into the user's chosen
 * display currency.
 *
 * @param amounts - Amounts in their own (account/local) currency, integer minor units.
 * @param options - Optional staleness threshold.
 */
export function useDisplayCurrencyRollup(
  amounts: readonly DisplayCurrencyAmount[],
  options: UseDisplayCurrencyRollupOptions = {},
): UseDisplayCurrencyRollupResult {
  const { displayCurrency } = useDisplayCurrency();
  const { rates, isOffline, isStale, lastUpdated, loading } = useExchangeRates(displayCurrency);
  const { staleAfter } = options;

  const { rollup, unconvertedCurrencies } = useMemo(() => {
    const target = displayCurrency.trim().toUpperCase();
    const available = new Set<string>([target, ...Object.keys(rates).map((c) => c.toUpperCase())]);
    const rateList: DisplayExchangeRate[] = Object.values(rates).map((rate) =>
      toDisplayRate(rate, isOffline),
    );

    const convertible: DisplayCurrencyAmount[] = [];
    const unconvertedSet = new Set<string>();
    for (const amount of amounts) {
      const code = amount.currency.trim().toUpperCase();
      if (available.has(code)) {
        convertible.push(amount);
      } else {
        unconvertedSet.add(code);
      }
    }

    return {
      rollup: aggregateDisplayCurrencyAmounts(convertible, target, rateList, { staleAfter }),
      unconvertedCurrencies: [...unconvertedSet].sort(),
    };
  }, [amounts, rates, isOffline, displayCurrency, staleAfter]);

  return {
    displayCurrency: rollup.displayCurrency,
    rollup,
    isConverted: rollup.convertedCurrencyCodes.length > 0 || unconvertedCurrencies.length > 0,
    isOffline,
    isStale,
    hasStaleRates: rollup.hasStaleRates || isOffline || isStale,
    lastUpdated,
    loading,
    unconvertedCurrencies,
  };
}
