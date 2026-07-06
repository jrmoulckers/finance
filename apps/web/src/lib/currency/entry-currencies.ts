// SPDX-License-Identifier: BUSL-1.1

/**
 * Entry-currency picker catalog for foreign-currency transaction entry.
 *
 * This module is intentionally separate from `minor-units.ts`: it is imported
 * ONLY by the lazily-loaded {@link ../../components/forms/CurrencyFxSection}, so
 * the (relatively large) currency code list and the `Intl.DisplayNames` label
 * resolver stay OUT of the widely-imported route bundles and only load when the
 * transaction form is actually opened.
 *
 * References: issue #2202 (web slice).
 */

import { getCurrencyDecimals, normalizeCurrencyCode } from './minor-units';

/** Human-friendly label metadata for the entry currency picker. */
export interface FxCurrencyOption {
  /** ISO 4217 currency code (uppercase). */
  readonly code: string;
  /** Number of decimal places (minor units per major unit = 10 ** decimalPlaces). */
  readonly decimalPlaces: number;
  /** Display label for the option, e.g. "THB — Thai Baht". */
  readonly label: string;
}

/**
 * Currencies offered in the transaction entry picker, ordered with the most
 * common nomad destinations first. Stored as codes only; the human-readable
 * names are resolved at runtime via `Intl.DisplayNames` so the (relatively
 * large) name strings stay out of the bundle.
 */
export const ENTRY_CURRENCY_CODES: readonly string[] = [
  'USD',
  'EUR',
  'GBP',
  'THB',
  'MXN',
  'JPY',
  'KRW',
  'VND',
  'IDR',
  'INR',
  'SGD',
  'MYR',
  'PHP',
  'AUD',
  'CAD',
  'BRL',
  'TRY',
  'AED',
  'KWD',
  'BHD',
];

let currencyDisplayNames: Intl.DisplayNames | null | undefined;

/**
 * Resolve a friendly label like "THB — Thai Baht" when the runtime can supply
 * the localized name, otherwise fall back to the bare ISO code. Names are read
 * from `Intl.DisplayNames` at runtime so they never inflate the bundle.
 */
export function getCurrencyLabel(code: string): string {
  const normalized = normalizeCurrencyCode(code) ?? code;
  if (currencyDisplayNames === undefined) {
    try {
      currencyDisplayNames = new Intl.DisplayNames(['en'], { type: 'currency' });
    } catch {
      currencyDisplayNames = null;
    }
  }
  try {
    const name = currencyDisplayNames?.of(normalized);
    return name && name !== normalized ? `${normalized} (${name})` : normalized;
  } catch {
    return normalized;
  }
}

/** Build the entry-currency picker options (code + decimals + runtime label). */
export function getEntryCurrencyOptions(): FxCurrencyOption[] {
  return ENTRY_CURRENCY_CODES.map((code) => ({
    code,
    decimalPlaces: getCurrencyDecimals(code),
    label: getCurrencyLabel(code),
  }));
}

const symbolCache = new Map<string, string>();

/**
 * Resolve a narrow currency symbol (e.g. `$`, `€`, `฿`) for display.
 *
 * Falls back to the currency code itself when the runtime cannot resolve a
 * symbol. Results are memoized because `Intl` formatting is comparatively
 * expensive and the set of currencies is small. Lives in this lazy-only module
 * so the `Intl.NumberFormat` symbol path stays out of the route bundles until
 * the transaction form is opened.
 */
export function getCurrencySymbol(code: string | null | undefined): string {
  const normalized = normalizeCurrencyCode(code) ?? 'USD';
  const cached = symbolCache.get(normalized);
  if (cached) return cached;

  let symbol: string;
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalized,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    symbol = parts.find((part) => part.type === 'currency')?.value ?? normalized;
  } catch {
    symbol = normalized;
  }

  symbolCache.set(normalized, symbol);
  return symbol;
}
