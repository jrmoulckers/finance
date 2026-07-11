// SPDX-License-Identifier: BUSL-1.1

/**
 * Single source of truth for the web app's locale catalog (issue #3314).
 *
 * Historically three lists disagreed about which locales exist:
 *   - `config/i18n/locales.json` (cross-platform canonical/enforced contract),
 *   - `SUPPORTED_LOCALES` in `lib/i18n.ts` (the language switcher), and
 *   - `LOCALE_PACKS` in `lib/i18n/locale-packs.ts` (translation catalogs).
 *
 * This registry collapses the two *web* lists into one: both the language
 * switcher (`SUPPORTED_LOCALES`) and the catalog map (`LOCALE_PACKS`) are now
 * derived from `LOCALE_REGISTRY`, so a locale can never appear in one list but
 * not the other, and a pack can never be shipped that nobody can select.
 *
 * Drift against the canonical cross-platform contract in
 * `config/i18n/locales.json` is asserted by `locale-registry.test.ts` (every
 * `enforced` canonical locale must be selectable here).
 */

import type { MessageCatalog } from './catalog-loader';
import { EN_US_CATALOG } from './locales/en-US';
import { ES_ES_CATALOG } from './locales/es-ES';
import { ZH_HANS_CATALOG } from './locales/zh-Hans';

/** Maturity of a locale's translation catalog. */
export type LocalePackStatus = 'source' | 'starter' | 'fallback-only';

export interface LocaleRegistryEntry {
  /** BCP-47 locale code (e.g. `en-US`, `zh-Hans`). */
  readonly code: string;
  /** English display label for the language switcher. */
  readonly label: string;
  /** Endonym shown next to the English label. */
  readonly nativeLabel: string;
  /** Text direction for layout mirroring. */
  readonly textDirection: 'ltr' | 'rtl';
  /**
   * Whether the locale is offered in the language switcher. Non-selectable
   * entries are catalogs that exist for tooling/fallback but are not yet ready
   * for users to pick (e.g. an empty starter candidate).
   */
  readonly selectable: boolean;
  /** Catalog maturity. */
  readonly status: LocalePackStatus;
  /** Locale to fall back to for untranslated keys. */
  readonly fallbackLocale: string;
  /** Notes for translators working on the pack. */
  readonly translatorNotes: readonly string[];
  /** The translation catalog (may be partial; missing keys fall back). */
  readonly messages: MessageCatalog;
}

export const LOCALE_REGISTRY: readonly LocaleRegistryEntry[] = [
  {
    code: 'en-US',
    label: 'English (United States)',
    nativeLabel: 'English (US)',
    textDirection: 'ltr',
    selectable: true,
    status: 'source',
    fallbackLocale: 'en-US',
    translatorNotes: [
      'Source catalog for product copy. Keep amounts, ISO currency codes, and user-entered account names in placeholders.',
      'Financial guidance copy must stay educational and avoid tax, legal, or investment advice guarantees.',
    ],
    messages: EN_US_CATALOG,
  },
  {
    code: 'es-ES',
    label: 'Spanish (Spain)',
    nativeLabel: 'Español',
    textDirection: 'ltr',
    selectable: true,
    status: 'starter',
    fallbackLocale: 'en-US',
    translatorNotes: [
      'Use consumer finance language: presupuesto, cuenta, transacción, tipo de cambio.',
      'Prefer “IVA” when copy is specifically Spain/EU tax terminology; use neutral “impuesto” for generic tax categories.',
      'Keep ISO currency codes such as USD and EUR unchanged and surrounded by bidi isolation in mixed-direction contexts.',
    ],
    messages: ES_ES_CATALOG,
  },
  {
    code: 'de-DE',
    label: 'German (Germany)',
    nativeLabel: 'Deutsch',
    textDirection: 'ltr',
    selectable: true,
    status: 'fallback-only',
    fallbackLocale: 'en-US',
    translatorNotes: ['Existing starter locale retained for language-switcher smoke coverage.'],
    messages: {
      'settings.language': 'Sprache',
      'settings.timeZone': 'Heimatzeitzone',
      'tips.fallbackNotice': 'Bis zur Übersetzung wird dieser Inhalt auf Englisch angezeigt.',
    },
  },
  {
    code: 'ja-JP',
    label: 'Japanese (Japan)',
    nativeLabel: '日本語',
    textDirection: 'ltr',
    selectable: true,
    status: 'fallback-only',
    fallbackLocale: 'en-US',
    translatorNotes: ['Existing starter locale retained for language-switcher smoke coverage.'],
    messages: {
      'settings.language': '言語',
      'settings.timeZone': 'ホームタイムゾーン',
      'tips.fallbackNotice': 'この教育コンテンツが翻訳されるまで英語で表示されます。',
    },
  },
  {
    code: 'zh-Hans',
    label: 'Chinese (Simplified)',
    nativeLabel: '简体中文',
    textDirection: 'ltr',
    selectable: true,
    status: 'starter',
    fallbackLocale: 'en-US',
    translatorNotes: [
      'Initial starter pack for immigrant remitters: settings, currency-rate display, remittances, multi-currency transaction entry, navigation, and empty/error states. Untranslated keys fall back to en-US.',
      'Use mainland Simplified Chinese consumer-finance terms: 汇率 (exchange rate), 汇款 (remittance), 手续费 (fee), 收款人 (recipient), 预算 (budget), 账户 (account).',
      'Keep amounts, ISO currency codes (USD, CNY), and user-entered names in placeholders; Chinese has no grammatical plural so plural forms share one text.',
    ],
    messages: ZH_HANS_CATALOG,
  },
  {
    code: 'ar',
    label: 'Arabic',
    nativeLabel: 'العربية',
    textDirection: 'rtl',
    selectable: true,
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
  {
    code: 'fr-CA',
    label: 'French (Canada)',
    nativeLabel: 'Français (Canada)',
    textDirection: 'ltr',
    // Not selectable: empty candidate pack retained for tooling/fallback only,
    // so it never appears in the switcher as a locale that renders no copy.
    selectable: false,
    status: 'fallback-only',
    fallbackLocale: 'en-US',
    translatorNotes: [
      'Starter candidate for Canadian beta households; choose Canadian French finance terminology before activation.',
      'Validate GST/HST/QST terminology and RRSP/TFSA labels against the regional conventions table.',
    ],
    messages: {},
  },
];

const registryByCode = new Map(LOCALE_REGISTRY.map((entry) => [entry.code, entry]));

/** Look up a registry entry by locale code. */
export function getLocaleRegistryEntry(code: string): LocaleRegistryEntry | null {
  return registryByCode.get(code) ?? null;
}

/** Locales that appear in the language switcher, in display order. */
export const SELECTABLE_LOCALE_ENTRIES: readonly LocaleRegistryEntry[] = LOCALE_REGISTRY.filter(
  (entry) => entry.selectable,
);
