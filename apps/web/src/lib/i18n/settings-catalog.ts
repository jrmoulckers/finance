// SPDX-License-Identifier: BUSL-1.1

import { translate } from '../i18n';

export const SETTINGS_COPY_IDS = {
  preferencesTitle: 'settings.preferences.title',
  preferencesAria: 'settings.preferences.aria',
  currencyLabel: 'settings.preferences.currency.label',
  currencyAria: 'settings.preferences.currency.aria',
  themeLabel: 'settings.preferences.theme.label',
  themeAria: 'settings.preferences.theme.aria',
  notificationsLabel: 'settings.preferences.notifications.label',
  notificationsAria: 'settings.preferences.notifications.aria',
  timeZoneAria: 'settings.preferences.timeZone.aria',
  currencyRatesTitle: 'settings.currencyRates.title',
  currencyRatesLoading: 'settings.currencyRates.loading',
  currencyRatesError: 'settings.currencyRates.error',
  currencyRatesRetry: 'settings.currencyRates.retry',
  currencyRatesRetryAria: 'settings.currencyRates.retryAria',
  currencyRatesProvider: 'settings.currencyRates.provider',
  currencyRatesLastUpdated: 'settings.currencyRates.lastUpdated',
  currencyRatesBaseCurrency: 'settings.currencyRates.baseCurrency',
  currencyRatesNever: 'settings.currencyRates.never',
  currencyRatesNotAvailable: 'settings.currencyRates.notAvailable',
  currencyRatesFreshness: 'settings.currencyRates.freshness',
  currencyRatesOfflineFallback: 'settings.currencyRates.offlineFallback',
  currencyRatesStale: 'settings.currencyRates.stale',
  currencyRatesManualOverridesActive: 'settings.currencyRates.manualOverridesActive',
  currencyRatesExchangeRates: 'settings.currencyRates.exchangeRates',
  currencyRatesExpandHint: 'settings.currencyRates.expandHint',
  currencyRatesTableAria: 'settings.currencyRates.tableAria',
  currencyRatesCurrency: 'settings.currencyRates.currency',
  currencyRatesRate: 'settings.currencyRates.rate',
  currencyRatesSource: 'settings.currencyRates.source',
  currencyRatesActions: 'settings.currencyRates.actions',
  currencyRatesOverrideRateAria: 'settings.currencyRates.overrideRateAria',
  currencyRatesSaveOverrideAria: 'settings.currencyRates.saveOverrideAria',
  currencyRatesCancelEditingAria: 'settings.currencyRates.cancelEditingAria',
  currencyRatesOverrideRateShortAria: 'settings.currencyRates.overrideRateShortAria',
  currencyRatesResetOverrideAria: 'settings.currencyRates.resetOverrideAria',
  currencyRatesSave: 'settings.currencyRates.save',
  currencyRatesCancel: 'settings.currencyRates.cancel',
  currencyRatesOverride: 'settings.currencyRates.override',
  currencyRatesReset: 'settings.currencyRates.reset',
  currencyRatesDisclaimer: 'settings.currencyRates.disclaimer',
  currencyRatesSourceStatic: 'settings.currencyRates.source.static',
  currencyRatesSourceStored: 'settings.currencyRates.source.stored',
  currencyRatesSourceApi: 'settings.currencyRates.source.api',
  currencyRatesSourceUserOverride: 'settings.currencyRates.source.userOverride',
} as const;

export type SettingsCopyKey = keyof typeof SETTINGS_COPY_IDS;
export type SettingsTranslator = (
  id: string,
  values?: Record<string, string | number>,
  locale?: string,
) => { text: string; translated: boolean };

function text(
  key: SettingsCopyKey,
  locale: string,
  values: Record<string, string | number> = {},
  translator: SettingsTranslator = translate,
): string {
  return translator(SETTINGS_COPY_IDS[key], values, locale).text;
}

const SOURCE_KEY_BY_RATE_SOURCE: Readonly<Record<string, SettingsCopyKey>> = {
  static: 'currencyRatesSourceStatic',
  stored: 'currencyRatesSourceStored',
  api: 'currencyRatesSourceApi',
  'user-override': 'currencyRatesSourceUserOverride',
};

export function getSettingsCopy(
  key: SettingsCopyKey,
  locale: string,
  values: Record<string, string | number> = {},
  translator: SettingsTranslator = translate,
): string {
  return text(key, locale, values, translator);
}

export function createSettingsCopy(locale: string, translator: SettingsTranslator = translate) {
  return {
    text: (key: SettingsCopyKey, values: Record<string, string | number> = {}) =>
      text(key, locale, values, translator),
    sourceLabel: (source: string) => {
      const key = SOURCE_KEY_BY_RATE_SOURCE[source];
      return key ? text(key, locale, {}, translator) : source;
    },
  } as const;
}
