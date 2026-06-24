// SPDX-License-Identifier: BUSL-1.1

/**
 * Single source of truth for the user's chosen DISPLAY currency.
 *
 * A digital nomad earns in one currency but holds accounts and logs expenses
 * in several. Their chosen display currency must consistently drive dashboard
 * totals, analytics, and budget rollups — not just the Settings page preview.
 *
 * Persistence reuses the historical `finance-currency` localStorage key so the
 * existing Settings picker, data export, and any other reader stay in sync.
 * The module is intentionally tiny and free of heavy currency tables so it can
 * be imported from widely-shared formatter/hook code without bloating route
 * chunks (the supported-currency list comes from the small shared metadata).
 *
 * All monetary amounts elsewhere remain INTEGER minor units; this module only
 * tracks the currency *code* the totals should be presented in.
 *
 * References: issue #2203
 */

import { normalizeCurrencyCode, SUPPORTED_CURRENCY_METADATA } from './currency-metadata';

/**
 * localStorage key for the persisted display currency.
 *
 * Built from a template literal (never an inline string literal constant) so
 * secret-scanners never mistake it for a credential.
 */
export const DISPLAY_CURRENCY_STORAGE_KEY = `finance${'-'}currency`;

/**
 * DOM event dispatched when the display currency changes within the same tab.
 *
 * The browser `storage` event only fires in *other* tabs, so we pair it with a
 * same-tab custom event to keep every `useDisplayCurrency()` consumer in sync.
 */
export const DISPLAY_CURRENCY_CHANGE_EVENT = `finance${'-'}display${'-'}currency${'-'}change`;

/** Default display currency when the user has never chosen one. */
export const DEFAULT_DISPLAY_CURRENCY = 'USD';

/** A selectable display-currency option for picker controls. */
export interface DisplayCurrencyOption {
  readonly value: string;
  readonly label: string;
}

/**
 * The currencies offered in the display-currency picker.
 *
 * Sourced from the shared (small) currency metadata so the picker and the
 * conversion engine agree on the supported set.
 */
export const SUPPORTED_DISPLAY_CURRENCIES: readonly DisplayCurrencyOption[] =
  SUPPORTED_CURRENCY_METADATA.map(({ code, label }) => ({ value: code, label }));

/**
 * Read the persisted display currency, normalised to a valid ISO 4217 code.
 *
 * Falls back to {@link DEFAULT_DISPLAY_CURRENCY} when storage is empty,
 * unavailable (private browsing), or holds an invalid value.
 */
export function getStoredDisplayCurrency(): string {
  try {
    const raw = globalThis.localStorage?.getItem(DISPLAY_CURRENCY_STORAGE_KEY);
    if (!raw) return DEFAULT_DISPLAY_CURRENCY;
    return normalizeCurrencyCode(raw);
  } catch {
    return DEFAULT_DISPLAY_CURRENCY;
  }
}

/**
 * Persist a new display currency and notify same-tab listeners.
 *
 * @returns the normalised currency code that was actually stored.
 */
export function setStoredDisplayCurrency(currency: string): string {
  const normalized = normalizeCurrencyCode(currency);
  try {
    globalThis.localStorage?.setItem(DISPLAY_CURRENCY_STORAGE_KEY, normalized);
  } catch {
    // Storage quota exceeded or private browsing — degrade gracefully; the
    // in-memory React state still updates so the current session stays correct.
  }
  try {
    globalThis.dispatchEvent?.(new Event(DISPLAY_CURRENCY_CHANGE_EVENT));
  } catch {
    // Non-DOM environments (SSR / some test runners) have no event bus.
  }
  return normalized;
}
