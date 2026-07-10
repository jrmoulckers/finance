// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useState } from 'react';

import { CurrencyDisplay } from '../../components/common/CurrencyDisplay';
import { ReadAloudButton } from '../../components/common/ReadAloudButton';
import { Checkbox } from '../../components/common/Checkbox';
import { CategorizationSettings } from '../../components/categorization';
import {
  HapticSettings,
  MinimalistModeSettings,
  NotificationSettings,
  SettingInfoWidget,
} from '../../components/settings';
import { CurrencyRatesSettings } from '../../components/settings/CurrencyRatesSettings';
import '../../components/settings/currency-rates-settings.css';
import { useAccessibility } from '../../hooks/useAccessibility';
import { useCategories } from '../../hooks/useCategories';
import { useFontScale } from '../../hooks/useFontScale';
import type { FontScalePreference } from '../../hooks/useFontScale';
import { useDisplayCurrency } from '../../hooks/useDisplayCurrency';
import { useLocalePreferences } from '../../hooks/useLocalePreferences';
import { useTheme } from '../../hooks/useTheme';
import type { DisplayDensity, ThemeValue } from '../../hooks/useTheme';
import { AppearanceSettings } from './AppearanceSettings';
import type { AccessibilityFontSize } from '../../contexts/AccessibilityContext';
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
import { getLocalePack } from '../../lib/i18n/locale-packs';
import { createSettingsCopy } from '../../lib/i18n/settings-catalog';
import { setOnboardingComplete } from '../../lib/local-only-mode';

const currencyOptions: Array<{ value: string; label: string }> = SUPPORTED_CURRENCY_METADATA.map(
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

const ACCESSIBILITY_FONT_SIZE_LABELS: Record<AccessibilityFontSize, string> = {
  normal: 'Normal (16px)',
  large: 'Large (18px)',
  'extra-large': 'Extra large (20px)',
};

/**
 * Preferences sub-page — locale/currency/theme/notifications,
 * money display formatting, and currency-rate management.
 */
export const SettingsPreferencesPage: React.FC = () => {
  const { theme, setTheme, themes, displayDensity, setDisplayDensity, densities } = useTheme();
  const { categories } = useCategories();
  const fontScale = useFontScale();
  const localePreferences = useLocalePreferences();
  const {
    accessibilityMode,
    fontSize,
    reduceMotion,
    effectiveReduceMotion,
    highContrast,
    speakAmounts,
    setAccessibilityMode,
    setFontSize,
    setReduceMotion,
    setHighContrast,
    setSpeakAmounts,
  } = useAccessibility();
  const displaySettings = useMoneyDisplay();
  // Display currency is the shared, app-wide preference (single source of
  // truth) that drives dashboard, analytics, and budget rollup totals — not a
  // value isolated to this page. See `useDisplayCurrency` / issue #2203.
  const { displayCurrency: currency, setDisplayCurrency } = useDisplayCurrency();
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

  const handleCurrencyChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setDisplayCurrency(event.target.value);
    },
    [setDisplayCurrency],
  );

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

  const handleSingleKeyShortcutsChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const enabled = event.target.checked;
      setSingleKeyShortcutsPreference(enabled);
      setSingleKeyShortcutsEnabled(enabled);
    },
    [],
  );

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

  const handleAccessibilityModeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setAccessibilityMode(event.target.checked ? 'simplified' : 'standard');
    },
    [setAccessibilityMode],
  );

  const handleFontSizeSettingChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setFontSize(event.target.value as AccessibilityFontSize);
    },
    [setFontSize],
  );

  const accessibilityPreviewClassName = [
    'accessibility-preview',
    accessibilityMode === 'simplified' ? 'accessibility-preview--simplified' : '',
    highContrast ? 'accessibility-preview--contrast' : '',
    effectiveReduceMotion ? 'accessibility-preview--reduced-motion' : '',
    fontSize !== 'normal' ? `accessibility-preview--${fontSize}` : '',
  ]
    .filter(Boolean)
    .join(' ');

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
                  aria-describedby="settings-currency-hint"
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
                <p id="settings-currency-hint" className="settings-item__hint">
                  Drives dashboard, analytics, and budget totals. Amounts in other currencies are
                  converted and clearly marked.
                </p>
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
                  aria-describedby={
                    getLocalePack(localePreferences.locale)?.status === 'fallback-only'
                      ? 'settings-language-beta'
                      : undefined
                  }
                  className="settings-item__select"
                  value={localePreferences.locale}
                  onChange={handleLocaleChange}
                >
                  {localePreferences.supportedLocales.map((option) => {
                    const isFallbackOnly = getLocalePack(option.code)?.status === 'fallback-only';
                    const betaBadge = isFallbackOnly
                      ? ` — ${translate('settings.language.betaBadge', {}, localePreferences.locale).text}`
                      : '';
                    return (
                      <option key={option.code} value={option.code}>
                        {option.nativeLabel} ({option.label}){betaBadge}
                      </option>
                    );
                  })}
                </select>
              </div>
              <p className="settings-item__description">
                {translate('settings.languageDescription', {}, localePreferences.locale).text}
              </p>
              {getLocalePack(localePreferences.locale)?.status === 'fallback-only' && (
                <p id="settings-language-beta" className="settings-item__description" role="status">
                  {translate('settings.language.betaNotice', {}, localePreferences.locale).text}
                </p>
              )}
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
          <div className="settings-item settings-item--static">
            <label className="settings-item__label" htmlFor="settings-single-key-shortcuts">
              Single-key shortcuts
            </label>
            <Checkbox
              id="settings-single-key-shortcuts"
              className="settings-item__checkbox-wrapper"
              checked={singleKeyShortcutsEnabled}
              onChange={handleSingleKeyShortcutsChange}
              aria-describedby="settings-single-key-shortcuts-help"
            />
            <p id="settings-single-key-shortcuts-help" className="settings-item__description">
              Turn off character-key shortcuts like N, /, ?, and G then D if they conflict with
              assistive technology. Ctrl/Cmd+K remains available.
            </p>
          </div>
          <HapticSettings />
        </div>
      </section>

      <NotificationSettings />

      <section aria-label="Auto-categorization" className="page-section">
        <CategorizationSettings categories={categories} />
      </section>

      <section aria-label="Accessibility" className="page-section">
        <div className="settings-group">
          <h3 className="settings-group__title">Accessibility</h3>
          <p className="settings-group__description">
            Simplified mode enlarges text, increases contrast, reduces motion, and keeps only
            essential navigation visible for elderly users and caregivers.
          </p>

          <div className="settings-item settings-item--static">
            <label className="settings-item__label" htmlFor="settings-accessibility-simplified">
              Simplified mode
            </label>
            <Checkbox
              id="settings-accessibility-simplified"
              className="settings-item__checkbox-wrapper"
              checked={accessibilityMode === 'simplified'}
              onChange={handleAccessibilityModeChange}
              aria-label="Simplified mode"
            />
            <p className="settings-item__description">
              Uses larger text, 56px touch targets, calmer motion, and simplified navigation.
            </p>
          </div>

          <div className="settings-item settings-item--static">
            <label className="settings-item__label" htmlFor="settings-accessibility-font-size">
              Font size
            </label>
            <div className="settings-item__control">
              <select
                id="settings-accessibility-font-size"
                aria-label="Accessibility font size"
                className="settings-item__select"
                value={fontSize}
                onChange={handleFontSizeSettingChange}
              >
                {Object.entries(ACCESSIBILITY_FONT_SIZE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="settings-item settings-item--static">
            <label className="settings-item__label" htmlFor="settings-accessibility-contrast">
              High contrast
            </label>
            <Checkbox
              id="settings-accessibility-contrast"
              className="settings-item__checkbox-wrapper"
              checked={highContrast}
              onChange={(event) => setHighContrast(event.target.checked)}
              aria-label="High contrast"
            />
          </div>

          <div className="settings-item settings-item--static">
            <label className="settings-item__label" htmlFor="settings-accessibility-motion">
              Reduce motion
            </label>
            <Checkbox
              id="settings-accessibility-motion"
              className="settings-item__checkbox-wrapper"
              checked={reduceMotion}
              onChange={(event) => setReduceMotion(event.target.checked)}
              aria-label="Reduce motion"
            />
            <p className="settings-item__description">
              {effectiveReduceMotion && !reduceMotion
                ? 'Currently reduced because your device already prefers less motion.'
                : 'Turns off animations and movement-heavy transitions.'}
            </p>
          </div>

          <div className="settings-item settings-item--static">
            <label className="settings-item__label" htmlFor="settings-accessibility-speech">
              Read amounts aloud
            </label>
            <Checkbox
              id="settings-accessibility-speech"
              className="settings-item__checkbox-wrapper"
              checked={speakAmounts}
              onChange={(event) => setSpeakAmounts(event.target.checked)}
              aria-label="Read amounts aloud"
            />
            <p className="settings-item__description">
              Adds a read-aloud control for key amounts using the Web Speech API in supported
              browsers.
            </p>
          </div>

          <div className="settings-item settings-item--static accessibility-preview-row">
            <div
              className={accessibilityPreviewClassName}
              role="group"
              aria-label="Simplified mode preview"
            >
              <div className="accessibility-preview__card">
                <p className="accessibility-preview__eyebrow">Mode preview</p>
                <p className="accessibility-preview__title">Monthly essentials</p>
                <div className="accessibility-preview__amount-row">
                  <CurrencyDisplay
                    amount={248000}
                    currency={currency}
                    colorize
                    className="accessibility-preview__amount"
                    context="Available for groceries, medications, and household bills"
                  />
                  <ReadAloudButton
                    amount={248000}
                    currency={currency}
                    context="Available for groceries, medications, and household bills"
                    label="Read amount aloud"
                  />
                </div>
                <p className="accessibility-preview__note">
                  Essential pages stay visible, controls become larger, and buttons use clearer
                  labels.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <MinimalistModeSettings />

      <AppearanceSettings />

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
            <Checkbox
              id="s-show-decimals"
              className="settings-item__checkbox-wrapper"
              checked={displaySettings.showDecimals}
              onChange={(e) => displaySettings.updateSettings({ showDecimals: e.target.checked })}
              aria-label="Show cents (decimal places)"
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
