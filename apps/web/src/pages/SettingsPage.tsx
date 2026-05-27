// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useState } from 'react';

import { useAuth } from '../auth/auth-context';
import { CurrencyDisplay } from '../components/common/CurrencyDisplay';
import { DataExport } from '../components/DataExport';
import { useDatabase } from '../db/DatabaseProvider';
import { eraseAllMoodTags } from '../db/repositories/transactions';
import { CrashReportingSettings, PrivacySettings } from '../components/gdpr';
import { SettingInfoWidget } from '../components/settings';
import { CurrencyRatesSettings } from '../components/settings/CurrencyRatesSettings';
import '../components/settings/currency-rates-settings.css';
import { PrivacyPersistenceOption, usePrivacyMode } from '../contexts/PrivacyModeContext';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { useTheme } from '../hooks/useTheme';
import type { ThemeValue } from '../hooks/useTheme';
import {
  loadBnplStackingThresholdCents,
  saveBnplStackingThresholdCents,
} from '../lib/bnpl-liability';
import type { CurrencyDisplayMode, NegativeFormat } from '../lib/display-settings';
import { useMoneyDisplay } from '../lib/display-settings';
import { initMonitoring } from '../lib/monitoring';
import {
  MOOD_TAGS_CHANGED_EVENT,
  MOOD_TAGS_ENABLED_KEY,
  MOOD_TAGS_SYNC_ENABLED_KEY,
  setMoodTagPreference,
} from '../lib/mood-tags';

const APP_VERSION = '0.1.0';
const CURRENCY_STORAGE_KEY = 'finance-currency';
const NOTIFICATIONS_STORAGE_KEY = 'finance-notifications';
const MONITORING_CONSENT_STORAGE_KEY = 'finance-monitoring-consent';

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
  { value: 'minus', label: 'Minus sign (−$1,234.56)' },
  { value: 'parentheses', label: 'Parentheses (($1,234.56))' },
  { value: 'color-only', label: 'Color only ($1,234.56)' },
];

/** Labels for currency display mode options. */
const CURRENCY_DISPLAY_OPTIONS: Array<{ value: CurrencyDisplayMode; label: string }> = [
  { value: 'symbol', label: 'Symbol ($)' },
  { value: 'code', label: 'Code (USD)' },
  { value: 'name', label: 'Name (US Dollar)' },
];

function useSettingsDatabase() {
  try {
    return useDatabase();
  } catch {
    return null;
  }
}

/**
 * Settings page for managing local web-app preferences and account actions.
 */
export const SettingsPage: React.FC = () => {
  const { theme, setTheme, themes } = useTheme();
  const { isPrivacyMode, togglePrivacyMode, persistence, setPersistence, firstActivationMessage } =
    usePrivacyMode();
  const [currency, setCurrency] = useState<CurrencyPreference>(
    () => (localStorage.getItem(CURRENCY_STORAGE_KEY) as CurrencyPreference) || 'USD',
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) !== 'false',
  );
  const [monitoringEnabled, setMonitoringEnabled] = useState(
    () => localStorage.getItem(MONITORING_CONSENT_STORAGE_KEY) === 'true',
  );
  const [bnplStackingThreshold, setBnplStackingThreshold] = useState(() =>
    String(loadBnplStackingThresholdCents() / 100),
  );
  const [moodTagsEnabled, setMoodTagsEnabled] = useState(
    () => localStorage.getItem(MOOD_TAGS_ENABLED_KEY) === 'true',
  );
  const [moodTagsSyncEnabled, setMoodTagsSyncEnabled] = useState(
    () => localStorage.getItem(MOOD_TAGS_SYNC_ENABLED_KEY) === 'true',
  );

  const {
    isAuthenticated,
    isLoading,
    logout,
    deleteAccount,
    user,
    registerNewPasskey,
    webAuthnSupported,
    isDemoMode: demoModeActive,
  } = useAuth();
  const { isOffline } = useOfflineStatus();
  const displaySettings = useMoneyDisplay();
  const db = useSettingsDatabase();
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [passkeyMessage, setPasskeyMessage] = useState<string | null>(null);

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

  const handlePrivacyPersistenceChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setPersistence(event.target.value as PrivacyPersistenceOption);
    },
    [setPersistence],
  );

  const handleMonitoringChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const nextMonitoringEnabled = event.target.checked;
    localStorage.setItem(MONITORING_CONSENT_STORAGE_KEY, String(nextMonitoringEnabled));
    setMonitoringEnabled(nextMonitoringEnabled);

    if (nextMonitoringEnabled) {
      initMonitoring();
    }
  }, []);

  const handleMoodTagsEnabledChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = event.target.checked;
    setMoodTagPreference(MOOD_TAGS_ENABLED_KEY, enabled);
    setMoodTagsEnabled(enabled);
    if (!enabled) {
      setMoodTagPreference(MOOD_TAGS_SYNC_ENABLED_KEY, false);
      setMoodTagsSyncEnabled(false);
    }
  }, []);

  const handleMoodTagsSyncChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = event.target.checked;
    setMoodTagPreference(MOOD_TAGS_SYNC_ENABLED_KEY, enabled);
    setMoodTagsSyncEnabled(enabled);
  }, []);

  const handleEraseMoodData = useCallback(() => {
    if (!window.confirm('Erase all mood data?')) return;
    if (db) eraseAllMoodTags(db);
    setMoodTagPreference(MOOD_TAGS_ENABLED_KEY, false);
    setMoodTagPreference(MOOD_TAGS_SYNC_ENABLED_KEY, false);
    setMoodTagsEnabled(false);
    setMoodTagsSyncEnabled(false);
    window.dispatchEvent(new Event(MOOD_TAGS_CHANGED_EVENT));
  }, [db]);

  const handleMonitoringToggle = useCallback((enabled: boolean) => {
    localStorage.setItem(MONITORING_CONSENT_STORAGE_KEY, String(enabled));
    setMonitoringEnabled(enabled);

    if (enabled) {
      initMonitoring();
    }
  }, []);

  const handleBnplThresholdChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const dollars = event.target.value;
    setBnplStackingThreshold(dollars);
    const cents = Math.round(Number.parseFloat(dollars || '0') * 100);
    if (Number.isFinite(cents) && cents > 0) {
      saveBnplStackingThresholdCents(cents);
    }
  }, []);

  const handlePasskeyRegistration = useCallback(async () => {
    if (!isAuthenticated || isPasskeyLoading) {
      return;
    }

    if (!webAuthnSupported) {
      setPasskeyMessage('Passkeys are not supported in this browser.');
      return;
    }

    setPasskeyMessage(null);
    setIsPasskeyLoading(true);

    try {
      await registerNewPasskey();
      setPasskeyMessage('Passkey registered successfully.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Passkey registration failed.';

      // Handle user cancellation gracefully.
      if (
        message.includes('cancelled') ||
        message.includes('canceled') ||
        message.includes('NotAllowedError')
      ) {
        setPasskeyMessage('Passkey registration was cancelled.');
      } else {
        setPasskeyMessage(message);
      }
    } finally {
      setIsPasskeyLoading(false);
    }
  }, [isAuthenticated, isPasskeyLoading, webAuthnSupported, registerNewPasskey]);

  const handleSignOut = useCallback(async () => {
    if (!isAuthenticated || isLoading) {
      return;
    }

    const confirmed = window.confirm('Are you sure you want to sign out?');
    if (!confirmed) {
      return;
    }

    await logout();
  }, [isAuthenticated, isLoading, logout]);

  return (
    <>
      <h2
        style={{
          fontSize: 'var(--type-scale-headline-font-size)',
          fontWeight: 'var(--type-scale-headline-font-weight)',
          marginBottom: 'var(--spacing-6)',
        }}
      >
        Settings
      </h2>
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
                  className="settings-item__input"
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
          <SettingInfoWidget settingKey="monitoring">
            <div className="settings-item settings-item--static">
              <label className="settings-item__label" htmlFor="s-monitoring">
                Error Reporting
              </label>
              <input
                type="checkbox"
                id="s-monitoring"
                checked={monitoringEnabled}
                onChange={handleMonitoringChange}
                aria-label="Send anonymous error reports to help improve the app"
                className="settings-item__checkbox"
              />
            </div>
          </SettingInfoWidget>
        </div>
      </section>
      <section aria-label="Experimental" className="page-section">
        <div className="settings-group">
          <h3 className="settings-group__title">Experimental</h3>
          <div className="settings-item settings-item--static">
            <label className="settings-item__label" htmlFor="settings-mood-tags">
              Allow mood tags on transactions
            </label>
            <input
              type="checkbox"
              id="settings-mood-tags"
              checked={moodTagsEnabled}
              onChange={handleMoodTagsEnabledChange}
              aria-label="Allow mood tags on transactions"
              className="settings-item__checkbox"
            />
          </div>
          {moodTagsEnabled && (
            <div className="settings-item settings-item--static">
              <label className="settings-item__label" htmlFor="settings-mood-tags-sync">
                Sync mood tags across my devices
              </label>
              <input
                type="checkbox"
                id="settings-mood-tags-sync"
                checked={moodTagsSyncEnabled}
                onChange={handleMoodTagsSyncChange}
                aria-label="Sync mood tags across my devices"
                className="settings-item__checkbox"
              />
            </div>
          )}
          <button
            type="button"
            className="settings-item settings-item--button"
            onClick={handleEraseMoodData}
            aria-label="Erase all mood data"
          >
            <span className="settings-item__label">Erase all mood data</span>
            <span className="settings-item__value">⌫</span>
          </button>
        </div>
      </section>
      <section aria-label="Display" className="page-section">
        <div className="settings-group">
          <h3 className="settings-group__title">Display</h3>
          <p
            className="settings-group__description"
            style={{
              fontSize: 'var(--font-size-sm, 0.875rem)',
              color: 'var(--semantic-text-secondary)',
              marginBottom: 'var(--spacing-4, 1rem)',
            }}
          >
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

          <div className="settings-item settings-item--static">
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
                {NEGATIVE_FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
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
              <CurrencyDisplay amount={123456} colorize />
              <CurrencyDisplay amount={0} colorize />
              <CurrencyDisplay amount={-123456} colorize />
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
          <div className="settings-item settings-item--static">
            <label className="settings-item__label" htmlFor="s-privacy-mode">
              Privacy Mode
            </label>
            <div className="settings-item__control">
              <input
                type="checkbox"
                id="s-privacy-mode"
                checked={isPrivacyMode}
                onChange={() => togglePrivacyMode()}
                aria-label="Hide all financial amounts and balances"
                className="settings-item__checkbox"
              />
            </div>
          </div>
          <p className="settings-item__description">{firstActivationMessage}</p>
          <div className="settings-item settings-item--static">
            <label className="settings-item__label" htmlFor="s-privacy-persistence">
              Privacy mode persistence
            </label>
            <div className="settings-item__control">
              <select
                id="s-privacy-persistence"
                aria-label="Privacy mode persistence"
                className="settings-item__select"
                value={persistence}
                onChange={handlePrivacyPersistenceChange}
              >
                <option value={PrivacyPersistenceOption.OffAfterOneMinute}>
                  Off after 1 minute
                </option>
                <option value={PrivacyPersistenceOption.OffWhenAppCloses}>
                  Off when app closes
                </option>
                <option value={PrivacyPersistenceOption.ManualOnly}>Manual only</option>
              </select>
            </div>
          </div>
        </div>
      </section>
      <section aria-label="Security" className="page-section">
        <div className="settings-group">
          <h3 className="settings-group__title">Security</h3>
          <div className="settings-item settings-item--static">
            <span className="settings-item__label">Account</span>
            <span className="settings-item__value">
              {isAuthenticated ? (user?.email ?? 'Not signed in') : 'Not signed in'}
            </span>
          </div>
          <SettingInfoWidget settingKey="biometricLock">
            <button
              type="button"
              className="settings-item settings-item--button"
              disabled
              aria-disabled="true"
              aria-label="Biometric lock — available in a future update"
            >
              <span className="settings-item__label">Biometric Lock</span>
              <span className="settings-item__value settings-item__value--muted">Coming soon</span>
            </button>
          </SettingInfoWidget>
          {!demoModeActive && (
            <SettingInfoWidget settingKey="passkeys">
              <button
                type="button"
                className="settings-item settings-item--button"
                onClick={() => {
                  void handlePasskeyRegistration();
                }}
                disabled={!isAuthenticated || isPasskeyLoading}
                aria-label={
                  user?.hasPasskey ? 'Passkeys — registered' : 'Passkeys — set up a passkey'
                }
              >
                <span className="settings-item__label">Passkeys</span>
                <span className="settings-item__value">
                  {isPasskeyLoading ? 'Registering…' : user?.hasPasskey ? '✓ Registered' : 'Set up'}
                </span>
              </button>
            </SettingInfoWidget>
          )}
          {!demoModeActive && passkeyMessage && (
            <div className="settings-item settings-item--static" role="status" aria-live="polite">
              <span className="settings-item__value">{passkeyMessage}</span>
            </div>
          )}
          <button
            type="button"
            className="settings-item settings-item--button"
            onClick={() => {
              void handleSignOut();
            }}
            disabled={!isAuthenticated || isLoading}
            aria-label="Sign out"
          >
            <span className="settings-item__label">Sign Out</span>
            <span className="settings-item__value">&rarr;</span>
          </button>
        </div>
      </section>
      <section aria-label="Data" className="page-section">
        <div className="settings-group">
          <h3 className="settings-group__title">Data</h3>
          <SettingInfoWidget settingKey="dataExport">
            <DataExport />
          </SettingInfoWidget>
          <SettingInfoWidget settingKey="syncStatus">
            <div className="settings-item settings-item--static" aria-live="polite">
              <span className="settings-item__label">Sync Status</span>
              <span className="settings-item__status">
                <span
                  aria-hidden="true"
                  className={`settings-item__status-dot ${isOffline ? 'settings-item__status-dot--offline' : 'settings-item__status-dot--online'}`}
                />
                <span className="settings-item__value">
                  {isOffline ? 'Offline — changes saved locally' : 'Online — synced'}
                </span>
              </span>
            </div>
          </SettingInfoWidget>
        </div>
      </section>
      <CurrencyRatesSettings baseCurrency={currency} />
      <section aria-label="About" className="page-section">
        <div className="settings-group">
          <h3 className="settings-group__title">About</h3>
          <div className="settings-item settings-item--static">
            <span className="settings-item__label">Version</span>
            <span className="settings-item__value">{APP_VERSION}</span>
          </div>
        </div>
      </section>
      <PrivacySettings
        onExportData={() => {
          const exportBtn = document.querySelector(
            '[aria-describedby="data-export-description"]',
          ) as HTMLButtonElement | null;
          exportBtn?.click();
        }}
        onDeleteAccount={async () => {
          if (!isAuthenticated) return;
          await deleteAccount();
        }}
      />
      <CrashReportingSettings enabled={monitoringEnabled} onToggle={handleMonitoringToggle} />
    </>
  );
};

export default SettingsPage;
