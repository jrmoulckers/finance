// SPDX-License-Identifier: BUSL-1.1

import type { MessageCatalog } from './catalog-loader';
import { EN_US_CATALOG } from './locales/en-US';
import { ES_ES_CATALOG } from './locales/es-ES';

export type LocalePackStatus = 'source' | 'starter' | 'fallback-only';

export interface LocalePack {
  readonly locale: string;
  readonly nativeName: string;
  readonly status: LocalePackStatus;
  readonly fallbackLocale: string;
  readonly translatorNotes: readonly string[];
  readonly messages: MessageCatalog;
}

export const LOCALE_PACKS: Readonly<Record<string, LocalePack>> = {
  'en-US': {
    locale: 'en-US',
    nativeName: 'English (US)',
    status: 'source',
    fallbackLocale: 'en-US',
    translatorNotes: [
      'Source catalog for product copy. Keep amounts, ISO currency codes, and user-entered account names in placeholders.',
      'Financial guidance copy must stay educational and avoid tax, legal, or investment advice guarantees.',
    ],
    messages: EN_US_CATALOG,
  },
  'es-ES': {
    locale: 'es-ES',
    nativeName: 'Español (España)',
    status: 'starter',
    fallbackLocale: 'en-US',
    translatorNotes: [
      'Use consumer finance language: presupuesto, cuenta, transacción, tipo de cambio.',
      'Prefer “IVA” when copy is specifically Spain/EU tax terminology; use neutral “impuesto” for generic tax categories.',
      'Keep ISO currency codes such as USD and EUR unchanged and surrounded by bidi isolation in mixed-direction contexts.',
    ],
    messages: ES_ES_CATALOG,
  },
  'fr-CA': {
    locale: 'fr-CA',
    nativeName: 'Français (Canada)',
    status: 'fallback-only',
    fallbackLocale: 'en-US',
    translatorNotes: [
      'Starter candidate for Canadian beta households; choose Canadian French finance terminology before activation.',
      'Validate GST/HST/QST terminology and RRSP/TFSA labels against the regional conventions table.',
    ],
    messages: {},
  },
  ar: {
    locale: 'ar',
    nativeName: 'العربية',
    status: 'fallback-only',
    fallbackLocale: 'en-US',
    translatorNotes: [
      'Starter RTL candidate; activate only after layout mirroring and bidi isolation pass visual regression checks.',
      'Keep amounts, account identifiers, and ISO currency codes isolated from surrounding Arabic text.',
    ],
    messages: {
      'settings.language': 'اللغة',
      'settings.timeZone': 'المنطقة الزمنية الرئيسية',
      'tips.fallbackNotice': 'يُعرض باللغة الإنجليزية إلى أن تتم ترجمة هذا المحتوى التعليمي.',
    },
  },
  'de-DE': {
    locale: 'de-DE',
    nativeName: 'Deutsch',
    status: 'fallback-only',
    fallbackLocale: 'en-US',
    translatorNotes: ['Existing starter locale retained for language-switcher smoke coverage.'],
    messages: {
      'settings.language': 'Sprache',
      'settings.timeZone': 'Heimatzeitzone',
      'tips.fallbackNotice': 'Bis zur Übersetzung wird dieser Inhalt auf Englisch angezeigt.',
    },
  },
  'ja-JP': {
    locale: 'ja-JP',
    nativeName: '日本語',
    status: 'fallback-only',
    fallbackLocale: 'en-US',
    translatorNotes: ['Existing starter locale retained for language-switcher smoke coverage.'],
    messages: {
      'settings.language': '言語',
      'settings.timeZone': 'ホームタイムゾーン',
      'tips.fallbackNotice': 'この教育コンテンツが翻訳されるまで英語で表示されます。',
    },
  },
};

export function getLocalePack(locale: string): LocalePack | null {
  return LOCALE_PACKS[locale] ?? null;
}

export function getActiveCatalogs(): Readonly<Record<string, MessageCatalog>> {
  return Object.fromEntries(Object.entries(LOCALE_PACKS).map(([locale, pack]) => [locale, pack.messages]));
}
