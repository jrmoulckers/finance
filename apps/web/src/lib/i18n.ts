// SPDX-License-Identifier: BUSL-1.1

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

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = [
  { code: 'en-US', label: 'English (United States)', nativeLabel: 'English (US)', textDirection: 'ltr' },
  { code: 'es-ES', label: 'Spanish (Spain)', nativeLabel: 'Español', textDirection: 'ltr' },
  { code: 'de-DE', label: 'German (Germany)', nativeLabel: 'Deutsch', textDirection: 'ltr' },
  { code: 'ja-JP', label: 'Japanese (Japan)', nativeLabel: '日本語', textDirection: 'ltr' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية', textDirection: 'rtl' },
] as const;

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

export type MessageCatalog = Record<string, string>;

const catalogs: Record<string, MessageCatalog> = {
  'en-US': {
    'settings.language': 'Language',
    'settings.timeZone': 'Home time zone',
    'settings.languageDescription': 'Detected from your browser; change it anytime.',
    'tips.budget-create-first.title': 'Set up your first budget',
    'tips.budget-create-first.description': 'Creating a budget helps you track spending and stay on target. Start with your largest expense category.',
    'tips.budget-create-first.action': 'Create Budget',
    'tips.account-create-first.title': 'Add your first account',
    'tips.account-create-first.description': 'Adding accounts is the first step to getting a complete picture of your finances.',
    'tips.account-create-first.action': 'Add Account',
    'tips.spending-no-transactions.title': 'Start tracking your spending',
    'tips.spending-no-transactions.description': 'You have no transactions recorded this month. Adding transactions helps you understand your spending patterns.',
    'tips.spending-no-transactions.action': 'Add Transaction',
    'tips.fallbackNotice': 'Shown in English until this education content is translated.',
  },
  'es-ES': {
    'settings.language': 'Idioma',
    'settings.timeZone': 'Zona horaria de casa',
    'settings.languageDescription': 'Detectado desde tu navegador; puedes cambiarlo cuando quieras.',
    'tips.budget-create-first.title': 'Configura tu primer presupuesto',
    'tips.budget-create-first.description': 'Crear un presupuesto te ayuda a controlar gastos y mantenerte en objetivo. Empieza por tu categoría de gasto más grande.',
    'tips.budget-create-first.action': 'Crear presupuesto',
    'tips.account-create-first.title': 'Añade tu primera cuenta',
    'tips.account-create-first.description': 'Añadir cuentas es el primer paso para tener una visión completa de tus finanzas.',
    'tips.account-create-first.action': 'Añadir cuenta',
    'tips.spending-no-transactions.title': 'Empieza a registrar tus gastos',
    'tips.spending-no-transactions.description': 'No tienes transacciones registradas este mes. Añadir transacciones te ayuda a entender tus patrones de gasto.',
    'tips.spending-no-transactions.action': 'Añadir transacción',
    'tips.fallbackNotice': 'Se muestra en inglés hasta que este contenido educativo esté traducido.',
  },
  'de-DE': {
    'settings.language': 'Sprache',
    'settings.timeZone': 'Heimatzeitzone',
    'settings.fallbackNotice': 'Bis zur Übersetzung wird dieser Inhalt auf Englisch angezeigt.',
  },
  'ja-JP': {
    'settings.language': '言語',
    'settings.timeZone': 'ホームタイムゾーン',
    'tips.fallbackNotice': 'この教育コンテンツが翻訳されるまで英語で表示されます。',
  },
  ar: {
    'settings.language': 'اللغة',
    'settings.timeZone': 'المنطقة الزمنية الرئيسية',
    'tips.fallbackNotice': 'يُعرض باللغة الإنجليزية إلى أن تتم ترجمة هذا المحتوى التعليمي.',
  },
};

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
  return SUPPORTED_LOCALES.find((candidate) => candidate.code.toLowerCase().startsWith(`${language}-`) || candidate.code.toLowerCase() === language)?.code ?? null;
}

export function detectBrowserLocale(languages?: readonly string[]): string {
  const candidates = languages ?? globalThis.navigator?.languages ?? [globalThis.navigator?.language ?? DEFAULT_LOCALE];
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
  return supportedByCode.get(normalizeLocale(locale) ?? DEFAULT_LOCALE)?.textDirection ?? 'ltr';
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
  const normalized = normalizeLocale(locale) ?? DEFAULT_LOCALE;
  const localeCatalog = catalogs[normalized] ?? catalogs[DEFAULT_LOCALE];
  const fallbackCatalog = catalogs[DEFAULT_LOCALE];
  const template = localeCatalog[id] ?? fallbackCatalog[id] ?? id;
  const translated = localeCatalog[id] !== undefined;

  return {
    text: template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`)),
    translated,
  };
}
