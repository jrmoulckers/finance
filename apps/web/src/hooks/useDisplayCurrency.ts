// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook exposing the user's chosen DISPLAY currency as a shared,
 * reactive preference.
 *
 * This is the single hook the rest of the app calls (directly, or through the
 * shared money formatter / rollup hooks) to know which currency aggregate
 * totals should be presented in. It mirrors the event-based pattern used by
 * `useLocalePreferences`: state is backed by `localStorage` and synchronised
 * across components via a same-tab custom event plus the cross-tab `storage`
 * event — so changing the picker in Settings propagates everywhere without a
 * page reload and without a mandatory context provider.
 *
 * References: issue #2203
 */

import { useCallback, useEffect, useState } from 'react';

import {
  DISPLAY_CURRENCY_CHANGE_EVENT,
  SUPPORTED_DISPLAY_CURRENCIES,
  getStoredDisplayCurrency,
  setStoredDisplayCurrency,
  type DisplayCurrencyOption,
} from '../lib/display-currency';

/** Return shape of {@link useDisplayCurrency}. */
export interface UseDisplayCurrencyResult {
  /** The currency code all aggregate totals should be presented in. */
  readonly displayCurrency: string;
  /** Persist a new display currency; propagates to every consumer. */
  readonly setDisplayCurrency: (currency: string) => void;
  /** Currencies offered by the display-currency picker. */
  readonly supportedCurrencies: readonly DisplayCurrencyOption[];
}

/**
 * Access the shared display-currency preference.
 *
 * Reads the persisted value on mount and re-renders whenever the preference
 * changes — whether the change originated from this component, another
 * component in the same tab, or another browser tab.
 */
export function useDisplayCurrency(): UseDisplayCurrencyResult {
  const [displayCurrency, setDisplayCurrencyState] = useState<string>(getStoredDisplayCurrency);

  useEffect(() => {
    const refresh = (): void => {
      setDisplayCurrencyState(getStoredDisplayCurrency());
    };

    // Re-sync immediately in case the value changed between the initial render
    // and effect commit (e.g. another component updated it first).
    refresh();
    globalThis.addEventListener?.(DISPLAY_CURRENCY_CHANGE_EVENT, refresh);
    globalThis.addEventListener?.('storage', refresh);
    return () => {
      globalThis.removeEventListener?.(DISPLAY_CURRENCY_CHANGE_EVENT, refresh);
      globalThis.removeEventListener?.('storage', refresh);
    };
  }, []);

  const setDisplayCurrency = useCallback((currency: string) => {
    const normalized = setStoredDisplayCurrency(currency);
    setDisplayCurrencyState(normalized);
  }, []);

  return {
    displayCurrency,
    setDisplayCurrency,
    supportedCurrencies: SUPPORTED_DISPLAY_CURRENCIES,
  };
}
