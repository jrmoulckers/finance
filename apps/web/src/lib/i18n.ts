// SPDX-License-Identifier: BUSL-1.1

import {
  createCatalogTranslator,
  type MessageCatalog as CatalogMessageMap,
} from './i18n/catalog-loader';
import { getActiveCatalogs } from './i18n/locale-packs';
import { SELECTABLE_LOCALE_ENTRIES } from './i18n/locale-registry';
import { getTextDirectionForLocale } from './i18n/rtl';

export const DEFAULT_LOCALE = 'en-US';
export const DEFAULT_TIME_ZONE = 'UTC';
export const LOCALE_STORAGE_KEY = 'finance-locale-preference';
export const TIME_ZONE_STORAGE_KEY = 'finance-time-zone-preference';

export interface SupportedLocale {
  readonly code: string;
  readonly label: string;
  readonly nativeLabel: string;
  readonly textDirection: 'ltr' | 'rtl';
}

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = SELECTABLE_LOCALE_ENTRIES.map(
  (entry) => ({
    code: entry.code,
    label: entry.label,
    nativeLabel: entry.nativeLabel,
    textDirection: entry.textDirection,
  }),
);

const supportedByCode = new Map(SUPPORTED_LOCALES.map((locale) => [locale.code, locale]));

export const TIME_ZONE_OPTIONS: readonly string[] = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Dubai',
] as const;

export type { MessageCatalog } from './i18n/catalog-loader';

export const TRANSLATION_CATALOGS: Readonly<Record<string, CatalogMessageMap>> =
  getActiveCatalogs();

const catalogTranslator = createCatalogTranslator({
  defaultLocale: DEFAULT_LOCALE,
  catalogs: TRANSLATION_CATALOGS,
});

function readStorage(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Preference persistence is best-effort when storage is unavailable.
  }
}

export function normalizeLocale(locale: string | null | undefined): string | null {
  if (!locale) return null;
  let canonical: string;
  try {
    canonical = Intl.getCanonicalLocales(locale)[0] ?? locale;
  } catch {
    return null;
  }
  if (supportedByCode.has(canonical)) return canonical;

  const language = canonical.split('-')[0]?.toLowerCase();
  return (
    SUPPORTED_LOCALES.find(
      (candidate) =>
        candidate.code.toLowerCase().startsWith(`${language}-`) ||
        candidate.code.toLowerCase() === language,
    )?.code ?? null
  );
}

export function detectBrowserLocale(languages?: readonly string[]): string {
  const candidates = languages ??
    globalThis.navigator?.languages ?? [globalThis.navigator?.language ?? DEFAULT_LOCALE];
  for (const candidate of candidates) {
    const normalized = normalizeLocale(candidate);
    if (normalized) return normalized;
  }
  return DEFAULT_LOCALE;
}

export function getStoredLocale(): string | null {
  return normalizeLocale(readStorage(LOCALE_STORAGE_KEY));
}

export function getCurrentLocale(): string {
  return getStoredLocale() ?? detectBrowserLocale();
}

export function setLocalePreference(locale: string): string {
  const normalized = normalizeLocale(locale) ?? DEFAULT_LOCALE;
  writeStorage(LOCALE_STORAGE_KEY, normalized);
  return normalized;
}

export function getLocaleDirection(locale: string = getCurrentLocale()): 'ltr' | 'rtl' {
  return getTextDirectionForLocale(normalizeLocale(locale) ?? locale ?? DEFAULT_LOCALE);
}

export function getCurrentTimeZone(): string {
  const stored = readStorage(TIME_ZONE_STORAGE_KEY);
  if (stored) return stored;
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
}

export function setTimeZonePreference(timeZone: string): string {
  const safeTimeZone = timeZone || DEFAULT_TIME_ZONE;
  new Intl.DateTimeFormat(DEFAULT_LOCALE, { timeZone: safeTimeZone }).format(new Date(0));
  writeStorage(TIME_ZONE_STORAGE_KEY, safeTimeZone);
  return safeTimeZone;
}

export function translate(
  id: string,
  values: Record<string, string | number> = {},
  locale: string = getCurrentLocale(),
): { text: string; translated: boolean } {
  const result = catalogTranslator.translate(id, values, locale);

  return {
    text: result.text,
    translated: result.translated,
  };
}
