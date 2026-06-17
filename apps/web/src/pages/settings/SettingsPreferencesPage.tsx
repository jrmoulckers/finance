// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useState } from 'react';

import { CurrencyDisplay } from '../../components/common/CurrencyDisplay';
import { SettingInfoWidget } from '../../components/settings';
import { CurrencyRatesSettings } from '../../components/settings/CurrencyRatesSettings';
import '../../components/settings/currency-rates-settings.css';
import { useFontScale } from '../../hooks/useFontScale';
import type { FontScalePreference } from '../../hooks/useFontScale';
import { useLocalePreferences } from '../../hooks/useLocalePreferences';
import { useTheme } from '../../hooks/useTheme';
import type { DisplayDensity, ThemeValue } from '../../hooks/useTheme';
import {
  loadBnplStackingThresholdCents,
  saveBnplStackingThresholdCents,
} from '../../lib/bnpl-liability';
import type { CurrencyDisplayMode, NegativeFormat } from '../../lib/display-settings';
import { formatAmountWithSettings, useMoneyDisplay } from '../../lib/display-settings';
import {
  getStoredSingleKeyShortcutsPreference,
  setSingleKeyShortcutsPreference,
} from '../../lib/accessibility-preferences';
import { SUPPORTED_CURRENCY_METADATA } from '../../lib/currency-metadata';
import { translate } from '../../lib/i18n';
import { createSettingsCopy } from '../../lib/i18n/settings-catalog';
import { setOnboardingComplete } from '../../lib/local-only-mode';

const CURRENCY_STORAGE_KEY = 'finance-currency';
const NOTIFICATIONS_STORAGE_KEY = 'finance-notifications';

type CurrencyPreference = string;

const currencyOptions: Array<{ value: CurrencyPreference; label: string }> = SUPPORTED_CURRENCY_METADATA.map(
  ({ code, label }) => ({ value: code, label }),
);

/** Labels for theme select options. */
const THEME_LABELS: Record<ThemeValue, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
  'dark-oled': 'OLED Dark',
  'high-contrast': 'High Contrast',
};

const DENSITY_LABELS: Record<DisplayDensity, string> = {
  comfortable: 'Comfortable',
  compact: 'Compact / Dense',
};

/**
 * Resolve a CSS color value to a hex string suitable for `<input type="color">`.
 *
 * When the stored color is a CSS variable reference (e.g. `var(--color-success)`),
 * the picker cannot interpret it, so we fall back to the provided default hex.
 */
function resolveColorForPicker(color: string, fallback: string): string {
  if (color.startsWith('#') && (color.length === 4 || color.length === 7)) {
    return color;
  }
  return fallback;
}

/** Labels for negative format options. */
const NEGATIVE_FORMAT_OPTIONS: Array<{ value: NegativeFormat; label: string }> = [
  { value: 'minus', label: 'Standard' },
  { value: 'parentheses', label: 'Accounting' },
  { value: 'color-only', label: 'Text label' },
];

/** Labels for currency display mode options. */
const CURRENCY_DISPLAY_OPTIONS: Array<{ value: CurrencyDisplayMode; label: string }> = [
  { value: 'symbol', label: 'Symbol ($)' },
  { value: 'code', label: 'Code (USD)' },
  { value: 'name', label: 'Name (US Dollar)' },
];

/**
 * Preferences sub-page — locale/currency/theme/notifications,
 * money display formatting, and currency-rate management.
 */
export const SettingsPreferencesPage: React.FC = () => {
  const { theme, setTheme, themes, displayDensity, setDisplayDensity, densities } = useTheme();
  const fontScale = useFontScale();
  const localePreferences = useLocalePreferences();
  const displaySettings = useMoneyDisplay();
  const [currency, setCurrency] = useState<CurrencyPreference>(
    () => (localStorage.getItem(CURRENCY_STORAGE_KEY) as CurrencyPreference) || 'USD',
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) !== 'false',
  );
  const [singleKeyShortcutsEnabled, setSingleKeyShortcutsEnabled] = useState(
    getStoredSingleKeyShortcutsPreference,
  );
  const [bnplStackingThreshold, setBnplStackingThreshold] = useState(() =>
    String(loadBnplStackingThresholdCents() / 100),
  );
  const settingsCopy = createSettingsCopy(localePreferences.locale);

  const handleThemeChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setTheme(event.target.value as ThemeValue);
    },
    [setTheme],
  );

  const handleDensityChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setDisplayDensity(event.target.value as DisplayDensity);
    },
    [setDisplayDensity],
  );

  const handleCurrencyChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextCurrency = event.target.value as CurrencyPreference;
    localStorage.setItem(CURRENCY_STORAGE_KEY, nextCurrency);
    setCurrency(nextCurrency);
  }, []);

  const handleLocaleChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      localePreferences.setLocale(event.target.value);
    },
    [localePreferences],
  );

  const handleTimeZoneChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      localePreferences.setTimeZone(event.target.value);
    },
    [localePreferences],
  );

  const handleFontScaleChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      fontScale.setPreference(event.target.value as FontScalePreference);
    },
    [fontScale],
  );

  const handleNotificationsChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const nextNotificationsEnabled = event.target.checked;
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, String(nextNotificationsEnabled));
    setNotificationsEnabled(nextNotificationsEnabled);
  }, []);

  const handleSingleKeyShortcutsChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = event.target.checked;
    setSingleKeyShortcutsPreference(enabled);
    setSingleKeyShortcutsEnabled(enabled);
  }, []);

  const handleBnplThresholdChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const dollars = event.target.value;
    setBnplStackingThreshold(dollars);
    const cents = Math.round(Number.parseFloat(dollars || '0') * 100);
    if (Number.isFinite(cents) && cents > 0) {
      saveBnplStackingThresholdCents(cents);
    }
  }, []);

  const handleRerunOnboarding = useCallback(() => {
    setOnboardingComplete(false);
    window.location.href = '/onboarding';
  }, []);

  return (
    <>
      <h2 className="settings-subpage__title">{settingsCopy.text('preferencesTitle')}</h2>
      <section aria-label={settingsCopy.text('preferencesAria')} className="page-section">
        <div className="settings-group">
          <h3 className="settings-group__title">{settingsCopy.text('preferencesTitle')}</h3>
          <SettingInfoWidget settingKey="currency">
            <div className="settings-item settings-item--static">
              <label className="settings-item__label" htmlFor="settings-currency">
                {settingsCopy.text('currencyLabel')}
              </label>
              <div className="settings-item__control">
                <select
                  id="settings-currency"
                  aria-label={settingsCopy.text('currencyAria')}
                  className="settings-item__select"
                  value={currency}
                  onChange={handleCurrencyChange}
                >
                  {currencyOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </SettingInfoWidget>
          <SettingInfoWidget settingKey="language">
            <div className="settings-item settings-item--static">
              <label className="settings-item__label" htmlFor="settings-language">
                {translate('settings.language', {}, localePreferences.locale).text}
              </label>
              <div className="settings-item__control">
                <select
                  id="settings-language"
                  aria-label="Language"
                  className="settings-item__select"
                  value={localePreferences.locale}
                  onChange={handleLocaleChange}
                >
                  {localePreferences.supportedLocales.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.nativeLabel} — {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="settings-item__description">
                {translate('settings.languageDescription', {}, localePreferences.locale).text}
              </p>
            </div>
          </SettingInfoWidget>
          <SettingInfoWidget settingKey="time-zone">
            <div className="settings-item settings-item--static">
              <label className="settings-item__label" htmlFor="settings-time-zone">
                {translate('settings.timeZone', {}, localePreferences.locale).text}
              </label>
              <div className="settings-item__control">
                <select
                  id="settings-time-zone"
                  aria-label="Home time zone"
                  className="settings-item__select"
                  value={localePreferences.timeZone}
                  onChange={handleTimeZoneChange}
                >
                  {localePreferences.timeZoneOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </SettingInfoWidget>
          <SettingInfoWidget settingKey="bnpl-stacking-threshold">
            <div className="settings-item settings-item--static">
              <label className="settings-item__label" htmlFor="settings-bnpl-threshold">
                BNPL stacking alert threshold
              </label>
              <div className="settings-item__control">
                <input
                  id="settings-bnpl-threshold"
                  className="form-input settings-item__input"
                  type="number"
                  min="1"
                  step="1"
                  value={bnplStackingThreshold}
                  onChange={handleBnplThresholdChange}
                  aria-describedby="settings-bnpl-threshold-help"
                />
              </div>
              <p id="settings-bnpl-threshold-help" className="settings-item__description">
                Alert when unpaid BNPL installments stack above this amount.
              </p>
            </div>
          </SettingInfoWidget>
          <SettingInfoWidget settingKey="theme">
            <div className="settings-item settings-item--static">
              <label className="settings-item__label" htmlFor="settings-theme">
                {settingsCopy.text('themeLabel')}
              </label>
              <div className="settings-item__control">
                <select
                  id="settings-theme"
                  aria-label={settingsCopy.text('themeAria')}
                  className="settings-item__select"
                  value={theme}
                  onChange={handleThemeChange}
                >
                  {themes.map((themeOption) => (
                    <option key={themeOption} value={themeOption}>
                      {THEME_LABELS[themeOption]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </SettingInfoWidget>
          <SettingInfoWidget settingKey="notifications">
            <div className="settings-item settings-item--static">
              <label className="settings-item__label" htmlFor="s-notif">
                {settingsCopy.text('notificationsLabel')}
              </label>
              <input
                type="checkbox"
                id="s-notif"
                checked={notificationsEnabled}
                onChange={handleNotificationsChange}
                aria-label={settingsCopy.text('notificationsAria')}
                className="settings-item__checkbox"
              />
            </div>
          </SettingInfoWidget>
          <div className="settings-item settings-item--static">
            <label className="settings-item__label" htmlFor="settings-single-key-shortcuts">
              Single-key shortcuts
            </label>
            <input
              type="checkbox"
              id="settings-single-key-shortcuts"
              checked={singleKeyShortcutsEnabled}
              onChange={handleSingleKeyShortcutsChange}
              aria-describedby="settings-single-key-shortcuts-help"
              className="settings-item__checkbox"
            />
            <p id="settings-single-key-shortcuts-help" className="settings-item__description">
              Turn off character-key shortcuts like N, /, ?, and G then D if they conflict with
              assistive technology. Ctrl/Cmd+K remains available.
            </p>
          </div>
        </div>
      </section>

      <section aria-label="Display" className="page-section">
        <div className="settings-group">
          <h3 className="settings-group__title">Display</h3>
          <p className="settings-group__description">
            Customize how monetary amounts appear throughout the app.
          </p>

          <div className="settings-item settings-item--static">
            <label className="settings-item__label" htmlFor="settings-font-scale">
              Text size
            </label>
            <div className="settings-item__control">
              <select
                id="settings-font-scale"
                aria-label="Text size"
                className="settings-item__select"
                value={fontScale.preference}
                onChange={handleFontScaleChange}
              >
                {fontScale.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} ({option.rootFontSize})
                  </option>
                ))}
              </select>
            </div>
            <p className="settings-item__description">
              Scales app text and spacing up to 200% while allowing pages to reflow.
            </p>
          </div>

          <div className="settings-item settings-item--static">
            <label className="settings-item__label" htmlFor="settings-display-density">
              Display density
            </label>
            <div className="settings-item__control">
              <select
                id="settings-display-density"
                aria-label="Display density"
                className="settings-item__select"
                value={displayDensity}
                onChange={handleDensityChange}
              >
                {(densities ?? []).map((densityOption) => (
                  <option key={densityOption} value={densityOption}>
                    {DENSITY_LABELS[densityOption]}
                  </option>
                ))}
              </select>
            </div>
            <p id="settings-display-density-help" className="settings-item__description">
              Compact density reduces padding, row heights, and supporting text for a denser trader
              workspace.
            </p>
          </div>

          <div className="settings-item settings-item--static">
            <label className="settings-item__label" htmlFor="settings-positive-color">
              Positive amount color
            </label>
            <div className="settings-item__control">
              <input
                type="color"
                id="settings-positive-color"
                aria-label="Positive amount color"
                value={resolveColorForPicker(displaySettings.positiveColor, '#22c55e')}
                onChange={(e) => displaySettings.updateSettings({ positiveColor: e.target.value })}
                className="settings-item__color-input"
              />
            </div>
          </div>

          <div className="settings-item settings-item--static">
            <label className="settings-item__label" htmlFor="settings-negative-color">
              Negative amount color
            </label>
            <div className="settings-item__control">
              <input
                type="color"
                id="settings-negative-color"
                aria-label="Negative amount color"
                value={resolveColorForPicker(displaySettings.negativeColor, '#ef4444')}
                onChange={(e) => displaySettings.updateSettings({ negativeColor: e.target.value })}
                className="settings-item__color-input"
              />
            </div>
          </div>

          <div className="settings-item settings-item--static">
            <label className="settings-item__label" htmlFor="settings-zero-color">
              Zero amount color
            </label>
            <div className="settings-item__control">
              <input
                type="color"
                id="settings-zero-color"
                aria-label="Zero amount color"
                value={resolveColorForPicker(displaySettings.zeroColor, '#6b7280')}
                onChange={(e) => displaySettings.updateSettings({ zeroColor: e.target.value })}
                className="settings-item__color-input"
              />
            </div>
          </div>

          <div className="settings-item settings-item--static">
            <label className="settings-item__label" htmlFor="s-show-decimals">
              Show cents
            </label>
            <input
              type="checkbox"
              id="s-show-decimals"
              checked={displaySettings.showDecimals}
              onChange={(e) => displaySettings.updateSettings({ showDecimals: e.target.checked })}
              aria-label="Show cents (decimal places)"
              className="settings-item__checkbox"
            />
          </div>

          <div className="settings-item settings-item--static settings-item--stacked">
            <div className="settings-item__row">
              <label className="settings-item__label" htmlFor="settings-negative-format">
                Negative format
              </label>
              <div className="settings-item__control">
                <select
                  id="settings-negative-format"
                  aria-label="Negative number format"
                  className="settings-item__select"
                  value={displaySettings.negativeFormat}
                  onChange={(e) =>
                    displaySettings.updateSettings({
                      negativeFormat: e.target.value as NegativeFormat,
                    })
                  }
                >
                  {NEGATIVE_FORMAT_OPTIONS.map((opt) => {
                    const example = formatAmountWithSettings(
                      -123456,
                      { ...displaySettings, negativeFormat: opt.value },
                      { currency },
                    );
                    return (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} ({example})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            <div className="negative-format-preview" aria-label="Negative format examples">
              {NEGATIVE_FORMAT_OPTIONS.map((opt) => {
                const example = formatAmountWithSettings(
                  -123456,
                  { ...displaySettings, negativeFormat: opt.value },
                  { currency },
                );
                const isColorOnly = opt.value === 'color-only';
                return (
                  <div className="negative-format-preview__row" key={opt.value}>
                    <span className="negative-format-preview__label">{opt.label}</span>
                    <span
                      className={
                        isColorOnly
                          ? 'negative-format-preview__amount negative-format-preview__amount--error'
                          : 'negative-format-preview__amount'
                      }
                    >
                      {example}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="settings-item settings-item--static">
            <label className="settings-item__label" htmlFor="settings-currency-display">
              Currency display
            </label>
            <div className="settings-item__control">
              <select
                id="settings-currency-display"
                aria-label="Currency display mode"
                className="settings-item__select"
                value={displaySettings.currencyDisplay}
                onChange={(e) =>
                  displaySettings.updateSettings({
                    currencyDisplay: e.target.value as CurrencyDisplayMode,
                  })
                }
              >
                {CURRENCY_DISPLAY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            className="settings-item settings-item--static"
            aria-label="Live preview of display settings"
            role="group"
          >
            <span className="settings-item__label">Preview</span>
            <span
              className="settings-item__value"
              style={{
                display: 'flex',
                gap: 'var(--spacing-4, 1rem)',
                flexWrap: 'wrap',
              }}
            >
              <CurrencyDisplay amount={123456} currency={currency} colorize />
              <CurrencyDisplay amount={0} currency={currency} colorize />
              <CurrencyDisplay amount={-123456} currency={currency} colorize />
            </span>
          </div>

          <button
            type="button"
            className="settings-item settings-item--button"
            onClick={() => displaySettings.resetSettings()}
            aria-label="Reset display settings to defaults"
          >
            <span className="settings-item__label">Reset to defaults</span>
            <span className="settings-item__value">↺</span>
          </button>

          <button
            type="button"
            className="settings-item settings-item--button"
            onClick={handleRerunOnboarding}
            aria-label="Run onboarding again"
          >
            <span className="settings-item__label">Run onboarding again</span>
            <span className="settings-item__value">Simple setup ›</span>
          </button>
        </div>
      </section>

      <CurrencyRatesSettings baseCurrency={currency} />
    </>
  );
};

export default SettingsPreferencesPage;



