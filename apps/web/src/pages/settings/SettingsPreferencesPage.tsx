// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useState } from 'react';

import { CurrencyDisplay } from '../../components/common/CurrencyDisplay';
import { SettingInfoWidget } from '../../components/settings';
import { CurrencyRatesSettings } from '../../components/settings/CurrencyRatesSettings';
import '../../components/settings/currency-rates-settings.css';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeValue } from '../../hooks/useTheme';
import {
  loadBnplStackingThresholdCents,
  saveBnplStackingThresholdCents,
} from '../../lib/bnpl-liability';
import type { CurrencyDisplayMode, NegativeFormat } from '../../lib/display-settings';
import { formatAmountWithSettings, useMoneyDisplay } from '../../lib/display-settings';

const CURRENCY_STORAGE_KEY = 'finance-currency';
const NOTIFICATIONS_STORAGE_KEY = 'finance-notifications';

type CurrencyPreference = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY';

const currencyOptions: Array<{ value: CurrencyPreference; label: string }> = [
  { value: 'USD', label: 'USD ($)' },
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'GBP', label: 'GBP (£)' },
  { value: 'CAD', label: 'CAD (C$)' },
  { value: 'AUD', label: 'AUD (A$)' },
  { value: 'JPY', label: 'JPY (¥)' },
];

/** Labels for theme select options. */
const THEME_LABELS: Record<ThemeValue, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
  'dark-oled': 'OLED Dark',
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
  { value: 'color-only', label: 'Color Only' },
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
  const { theme, setTheme, themes } = useTheme();
  const displaySettings = useMoneyDisplay();
  const [currency, setCurrency] = useState<CurrencyPreference>(
    () => (localStorage.getItem(CURRENCY_STORAGE_KEY) as CurrencyPreference) || 'USD',
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) !== 'false',
  );
  const [bnplStackingThreshold, setBnplStackingThreshold] = useState(() =>
    String(loadBnplStackingThresholdCents() / 100),
  );

  const handleThemeChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setTheme(event.target.value as ThemeValue);
    },
    [setTheme],
  );

  const handleCurrencyChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextCurrency = event.target.value as CurrencyPreference;
    localStorage.setItem(CURRENCY_STORAGE_KEY, nextCurrency);
    setCurrency(nextCurrency);
  }, []);

  const handleNotificationsChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const nextNotificationsEnabled = event.target.checked;
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, String(nextNotificationsEnabled));
    setNotificationsEnabled(nextNotificationsEnabled);
  }, []);

  const handleBnplThresholdChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const dollars = event.target.value;
    setBnplStackingThreshold(dollars);
    const cents = Math.round(Number.parseFloat(dollars || '0') * 100);
    if (Number.isFinite(cents) && cents > 0) {
      saveBnplStackingThresholdCents(cents);
    }
  }, []);

  return (
    <>
      <h2 className="settings-subpage__title">Preferences</h2>
      <section aria-label="Preferences" className="page-section">
        <div className="settings-group">
          <h3 className="settings-group__title">Preferences</h3>
          <SettingInfoWidget settingKey="currency">
            <div className="settings-item settings-item--static">
              <label className="settings-item__label" htmlFor="settings-currency">
                Currency
              </label>
              <div className="settings-item__control">
                <select
                  id="settings-currency"
                  aria-label="Currency"
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
                Theme
              </label>
              <div className="settings-item__control">
                <select
                  id="settings-theme"
                  aria-label="Theme"
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
                Notifications
              </label>
              <input
                type="checkbox"
                id="s-notif"
                checked={notificationsEnabled}
                onChange={handleNotificationsChange}
                aria-label="Notifications"
                className="settings-item__checkbox"
              />
            </div>
          </SettingInfoWidget>
        </div>
      </section>

      <section aria-label="Display" className="page-section">
        <div className="settings-group">
          <h3 className="settings-group__title">Display</h3>
          <p className="settings-group__description">
            Customize how monetary amounts appear throughout the app.
          </p>

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
        </div>
      </section>

      <CurrencyRatesSettings baseCurrency={currency} />
    </>
  );
};

export default SettingsPreferencesPage;
