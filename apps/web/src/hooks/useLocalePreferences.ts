// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useEffect, useState } from 'react';

import {
  getCurrentLocale,
  getCurrentTimeZone,
  setLocalePreference,
  setTimeZonePreference,
  SUPPORTED_LOCALES,
  TIME_ZONE_OPTIONS,
} from '../lib/i18n';

const PREFERENCE_EVENT = 'finance-locale-preference-change';

export interface UseLocalePreferencesResult {
  readonly locale: string;
  readonly timeZone: string;
  readonly supportedLocales: typeof SUPPORTED_LOCALES;
  readonly timeZoneOptions: typeof TIME_ZONE_OPTIONS;
  readonly setLocale: (locale: string) => void;
  readonly setTimeZone: (timeZone: string) => void;
}

function notifyPreferenceChange(): void {
  globalThis.dispatchEvent?.(new Event(PREFERENCE_EVENT));
}

export function useLocalePreferences(): UseLocalePreferencesResult {
  const [locale, setLocaleState] = useState(getCurrentLocale);
  const [timeZone, setTimeZoneState] = useState(getCurrentTimeZone);

  useEffect(() => {
    const refresh = () => {
      setLocaleState(getCurrentLocale());
      setTimeZoneState(getCurrentTimeZone());
    };

    globalThis.addEventListener?.(PREFERENCE_EVENT, refresh);
    globalThis.addEventListener?.('storage', refresh);
    return () => {
      globalThis.removeEventListener?.(PREFERENCE_EVENT, refresh);
      globalThis.removeEventListener?.('storage', refresh);
    };
  }, []);

  const setLocale = useCallback((nextLocale: string) => {
    const normalized = setLocalePreference(nextLocale);
    setLocaleState(normalized);
    document.documentElement.lang = normalized;
    notifyPreferenceChange();
  }, []);

  const setTimeZone = useCallback((nextTimeZone: string) => {
    const normalized = setTimeZonePreference(nextTimeZone);
    setTimeZoneState(normalized);
    notifyPreferenceChange();
  }, []);

  return {
    locale,
    timeZone,
    supportedLocales: SUPPORTED_LOCALES,
    timeZoneOptions: TIME_ZONE_OPTIONS,
    setLocale,
    setTimeZone,
  };
}
