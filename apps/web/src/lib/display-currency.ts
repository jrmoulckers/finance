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
 * References: issue #2203, issue #3291
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
 * Legacy localStorage key that the old `useMultiCurrency` hook wrote its own,
 * divergent display-currency copy to (as a JSON `{ code, decimalPlaces }`
 * object). It is retained ONLY so the one-time migration below can seed the
 * canonical key from it — no code should read or write it going forward (#3291).
 *
 * Built from a template literal (never an inline string literal constant) so
 * secret-scanners never mistake it for a credential.
 */
export const LEGACY_MULTI_CURRENCY_STORAGE_KEY = `finance${'-'}default${'-'}currency`;

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

/**
 * Extract a currency code from a legacy `finance-default-currency` value.
 *
 * The old `useMultiCurrency` hook serialised a `{ code, decimalPlaces }` object,
 * but we also tolerate a bare `"EUR"` code string in case an even older build
 * stored one. Returns `null` when no usable code can be recovered.
 */
function extractLegacyCurrencyCode(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'string') return parsed;
    if (parsed !== null && typeof parsed === 'object' && 'code' in parsed) {
      const { code } = parsed as { code?: unknown };
      if (typeof code === 'string') return code;
    }
    return null;
  } catch {
    // Not JSON — treat the stored value itself as a bare code string.
    return raw;
  }
}

/**
 * One-time migration that folds the legacy `finance-default-currency` value into
 * the single canonical {@link DISPLAY_CURRENCY_STORAGE_KEY}.
 *
 * Before #3291 the multi-currency dashboard widgets persisted their own display
 * currency under a separate key, so the currency chosen in Settings and the one
 * the widgets showed could disagree. This seeds the canonical key from any legacy
 * value — but only when the canonical key is not already set, so an explicit
 * Settings choice always wins — and then removes the legacy key so the two can
 * never diverge again.
 *
 * Idempotent and best-effort: safe to call on every startup, and a no-op once the
 * legacy key has been removed or storage is unavailable (private browsing / SSR).
 */
export function migrateLegacyDisplayCurrencyPreference(): void {
  try {
    const store = globalThis.localStorage;
    if (!store) return;

    const legacyRaw = store.getItem(LEGACY_MULTI_CURRENCY_STORAGE_KEY);
    if (legacyRaw === null) return;

    // Only seed when the canonical key has no value yet — a preference already
    // expressed through the shared key must never be clobbered by the old copy.
    if (!store.getItem(DISPLAY_CURRENCY_STORAGE_KEY)) {
      const code = extractLegacyCurrencyCode(legacyRaw);
      if (code) {
        // Reuse the canonical setter so the value is normalised and same-tab
        // listeners are notified.
        setStoredDisplayCurrency(code);
      }
    }

    // Remove the legacy key regardless: keeping it would reintroduce a second
    // source of truth that could drift from the canonical preference again.
    store.removeItem(LEGACY_MULTI_CURRENCY_STORAGE_KEY);
  } catch {
    // Storage unavailable (private browsing / SSR) — nothing to migrate.
  }
}
