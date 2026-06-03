// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useState } from 'react';

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
import {
  clearLocalAccountData,
  getHouseholdDeletionImpact,
  type HouseholdDeletionImpact,
} from '../lib/account/account-deletion';

const APP_VERSION = '0.1.0';
const CURRENCY_STORAGE_KEY = 'finance-currency';
const NOTIFICATIONS_STORAGE_KEY = 'finance-notifications';
const MONITORING_CONSENT_STORAGE_KEY = 'finance-monitoring-consent';
const ACCOUNT_DELETED_FLASH_KEY = 'finance:account-deleted-flash';

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
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [householdImpact, setHouseholdImpact] = useState<HouseholdDeletionImpact>({
    soloOwnedHouseholds: 0,
    memberHouseholds: 0,
    pendingInvites: 0,
  });

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

  const openDeleteModal = useCallback(() => {
    setDeleteConfirmationText('');
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  }, []);

  const closeDeleteModal = useCallback(() => {
    if (isDeletingAccount) return;
    setIsDeleteModalOpen(false);
    setDeleteConfirmationText('');
    setDeleteError(null);
  }, [isDeletingAccount]);

  useEffect(() => {
    if (!isDeleteModalOpen) return;
    try {
      setHouseholdImpact(getHouseholdDeletionImpact(db, user?.id));
    } catch {
      setHouseholdImpact({ soloOwnedHouseholds: 0, memberHouseholds: 0, pendingInvites: 0 });
    }
  }, [db, isDeleteModalOpen, user?.id]);

  const handleAccountDelete = useCallback(async () => {
    // Defense-in-depth: even though the destructive button is disabled
    // when the typed token does not match, re-check here in case the
    // disabled attribute is bypassed via devtools or assistive tech
    // (issue #1961). The server also independently re-validates the
    // confirmation in services/api/supabase/functions/account-delete.
    if (!isAuthenticated || deleteConfirmationText !== 'DELETE' || isDeletingAccount) {
      return;
    }

    setDeleteError(null);
    setIsDeletingAccount(true);

    try {
      const response = await fetch('/api/account/delete-account', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ confirmation: 'DELETE' }),
      });

      // Issue #1960 — the production Caddy config used to be missing the
      // `/api/account/*` proxy rule, so this fetch fell through to the
      // SPA fallback and returned 200 OK with an HTML body. The client
      // happily treated that as "success" and cleared the local cache
      // while the server had not deleted a single row.
      //
      // Guard against any future regression of that nature by insisting
      // the response is either 204 (success contract — see the edge
      // function), or a non-HTML payload with a 2xx status.
      const contentType = response.headers.get('Content-Type') ?? '';
      const looksLikeHtml = contentType.includes('text/html');
      if (!response.ok || looksLikeHtml) {
        throw new Error('Account deletion failed.');
      }

      await clearLocalAccountData(db);
      localStorage.clear();
      sessionStorage.clear();
      sessionStorage.setItem(ACCOUNT_DELETED_FLASH_KEY, 'Your account has been deleted.');
      window.location.assign('/login?accountDeleted=1');
    } catch {
      setDeleteError("Couldn't delete account — please try again or contact support.");
      setIsDeletingAccount(false);
    }
  }, [db, deleteConfirmationText, isAuthenticated, isDeletingAccount]);

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
        onDeleteAccount={() => {
          if (!isAuthenticated) return;
          openDeleteModal();
        }}
      />
      {isDeleteModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          aria-describedby="delete-account-description"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'grid',
            placeItems: 'center',
            padding: 'var(--spacing-4, 1rem)',
            background: 'rgba(15, 23, 42, 0.72)',
          }}
        >
          <div
            style={{
              width: 'min(100%, 36rem)',
              borderRadius: 'var(--radius-lg, 1rem)',
              padding: 'var(--spacing-6, 1.5rem)',
              background: 'var(--semantic-surface-primary, var(--color-surface))',
              boxShadow: 'var(--shadow-xl, 0 24px 64px rgba(0, 0, 0, 0.28))',
            }}
          >
            <h3 id="delete-account-title" className="settings-group__title">
              Delete account and all data
            </h3>
            <p id="delete-account-description" className="settings-item__description">
              This permanently deletes your account, personal finance data, passkeys, connected bank
              links, audit entries, and authentication record. This cannot be undone.
            </p>
            {/*
              Household + shared-data consequences (issue #1962).
              The wording is mirrored by the server-side policy in
              services/api/supabase/functions/account-delete/index.ts —
              update both together.
            */}
            <ul aria-label="What will be deleted" className="settings-item__description">
              <li>
                All your personal accounts, transactions, budgets, goals, categories, settings, and
                audit records will be permanently deleted.
              </li>
              {householdImpact.soloOwnedHouseholds > 0 && (
                <li>
                  {householdImpact.soloOwnedHouseholds} household
                  {householdImpact.soloOwnedHouseholds === 1 ? '' : 's'} you solely own will be
                  deleted entirely — any other invited members lose access.
                </li>
              )}
              {householdImpact.memberHouseholds > 0 && (
                <li>
                  You will be removed from {householdImpact.memberHouseholds} shared household
                  {householdImpact.memberHouseholds === 1 ? '' : 's'}. The household itself stays,
                  but every transaction, budget, goal, account, and category you contributed there
                  is deleted. Data owned by other members is untouched.
                </li>
              )}
              {householdImpact.pendingInvites > 0 && (
                <li>
                  {householdImpact.pendingInvites} pending invitation
                  {householdImpact.pendingInvites === 1 ? '' : 's'} you sent will be revoked.
                </li>
              )}
              <li>
                Your sign-in identity (Google / Apple / email / passkey) is unlinked. Signing in
                again creates a brand-new empty account.
              </li>
              <li>This action cannot be undone.</li>
            </ul>
            <label className="settings-item__label" htmlFor="delete-account-confirmation">
              Type DELETE to confirm
            </label>
            <input
              id="delete-account-confirmation"
              className="settings-item__input"
              value={deleteConfirmationText}
              onChange={(event) => setDeleteConfirmationText(event.target.value)}
              disabled={isDeletingAccount}
              autoComplete="off"
              aria-describedby="delete-account-confirmation-help"
            />
            <p
              id="delete-account-confirmation-help"
              className="settings-item__description"
              style={{ marginTop: 'var(--spacing-1, 0.25rem)' }}
            >
              The deletion button stays disabled until you type the word DELETE exactly.
            </p>
            {deleteError && (
              <p role="alert" style={{ color: 'var(--semantic-danger, #dc2626)' }}>
                {deleteError}
              </p>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 'var(--spacing-3, 0.75rem)',
                marginTop: 'var(--spacing-5, 1.25rem)',
              }}
            >
              <button
                type="button"
                className="settings-account-delete__cancel-button settings-account-delete__cancel-button--secondary"
                onClick={closeDeleteModal}
                disabled={isDeletingAccount}
                style={{
                  border: '1px solid var(--semantic-border-primary, #d1d5db)',
                  background: 'transparent',
                  color: 'var(--semantic-text-secondary, #475569)',
                  padding: '0.625rem 1rem',
                  borderRadius: 'var(--radius-md, 0.5rem)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="settings-account-delete__confirm-button settings-account-delete__confirm-button--danger"
                onClick={() => {
                  void handleAccountDelete();
                }}
                disabled={deleteConfirmationText !== 'DELETE' || isDeletingAccount}
                aria-disabled={deleteConfirmationText !== 'DELETE' || isDeletingAccount}
                style={{
                  border: '1px solid var(--semantic-danger, #dc2626)',
                  background: 'var(--semantic-danger, #dc2626)',
                  color: '#fff',
                  fontWeight: 700,
                  padding: '0.625rem 1rem',
                  borderRadius: 'var(--radius-md, 0.5rem)',
                  opacity: deleteConfirmationText !== 'DELETE' || isDeletingAccount ? 0.55 : 1,
                  cursor:
                    deleteConfirmationText !== 'DELETE' || isDeletingAccount
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                {isDeletingAccount ? 'Deleting…' : 'Yes, Delete Everything'}
              </button>
            </div>
          </div>
        </div>
      )}
      <CrashReportingSettings enabled={monitoringEnabled} onToggle={handleMonitoringToggle} />
    </>
  );
};

export default SettingsPage;
