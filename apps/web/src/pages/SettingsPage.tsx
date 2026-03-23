// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../auth/auth-context';
import { DataExport } from '../components/DataExport';
import { useCategories } from '../hooks/useCategories';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { useSpendingWatchlist } from '../hooks/useSpendingWatchlist';
import { initMonitoring } from '../lib/monitoring';

import '../styles/watchlist.css';

const APP_VERSION = '0.1.0';
const THEME_STORAGE_KEY = 'finance-theme';
const CURRENCY_STORAGE_KEY = 'finance-currency';
const NOTIFICATIONS_STORAGE_KEY = 'finance-notifications';
const MONITORING_CONSENT_STORAGE_KEY = 'finance-monitoring-consent';

type ThemePreference = 'light' | 'dark' | 'system';
type CurrencyPreference = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY';

const currencyOptions: Array<{ value: CurrencyPreference; label: string }> = [
  { value: 'USD', label: 'USD ($)' },
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'GBP', label: 'GBP (£)' },
  { value: 'CAD', label: 'CAD (C$)' },
  { value: 'AUD', label: 'AUD (A$)' },
  { value: 'JPY', label: 'JPY (¥)' },
];

function getSystemThemeMediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }

  return window.matchMedia('(prefers-color-scheme: dark)');
}

function applyThemePreference(theme: ThemePreference): void {
  const root = document.documentElement;

  if (theme === 'light') {
    root.classList.remove('dark');
    root.setAttribute('data-theme', 'light');
    return;
  }

  if (theme === 'dark') {
    root.classList.add('dark');
    root.setAttribute('data-theme', 'dark');
    return;
  }

  const prefersDark = getSystemThemeMediaQuery()?.matches ?? false;
  root.classList.toggle('dark', prefersDark);
  root.removeAttribute('data-theme');
}

/**
 * Settings page for managing local web-app preferences and account actions.
 */
export const SettingsPage: React.FC = () => {
  const [theme, setTheme] = useState<ThemePreference>(
    () => (localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference) || 'system',
  );
  const [currency, setCurrency] = useState<CurrencyPreference>(
    () => (localStorage.getItem(CURRENCY_STORAGE_KEY) as CurrencyPreference) || 'USD',
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) !== 'false',
  );
  const [monitoringEnabled, setMonitoringEnabled] = useState(
    () => localStorage.getItem(MONITORING_CONSENT_STORAGE_KEY) === 'true',
  );

  const { isAuthenticated, isLoading, logout, user, registerNewPasskey, webAuthnSupported } =
    useAuth();
  const { isOffline } = useOfflineStatus();
  const { categories } = useCategories();
  const { watchlists, addWatchlist, removeWatchlist, toggleActive } = useSpendingWatchlist();
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [passkeyMessage, setPasskeyMessage] = useState<string | null>(null);

  // Watchlist form state
  const [watchlistCategoryId, setWatchlistCategoryId] = useState('');
  const [watchlistThreshold, setWatchlistThreshold] = useState('');

  const handleThemeChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextTheme = event.target.value as ThemePreference;
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    setTheme(nextTheme);
  }, []);

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

  const handleAddWatchlist = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!watchlistCategoryId || !watchlistThreshold) return;
      const thresholdCents = Math.round(parseFloat(watchlistThreshold) * 100);
      if (thresholdCents <= 0 || Number.isNaN(thresholdCents)) return;
      addWatchlist(watchlistCategoryId, thresholdCents);
      setWatchlistCategoryId('');
      setWatchlistThreshold('');
    },
    [watchlistCategoryId, watchlistThreshold, addWatchlist],
  );

  const handleMonitoringChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const nextMonitoringEnabled = event.target.checked;
    localStorage.setItem(MONITORING_CONSENT_STORAGE_KEY, String(nextMonitoringEnabled));
    setMonitoringEnabled(nextMonitoringEnabled);

    if (nextMonitoringEnabled) {
      initMonitoring();
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

  useEffect(() => {
    applyThemePreference(theme);

    if (theme !== 'system') {
      return undefined;
    }

    const mediaQuery = getSystemThemeMediaQuery();
    if (!mediaQuery) {
      return undefined;
    }

    const handleChange = () => {
      applyThemePreference('system');
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, [theme]);

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
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
          </div>
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
        </div>
      </section>
      <section aria-label="Spending Watchlists" className="page-section">
        <div className="settings-group">
          <h3 className="settings-group__title">Spending Watchlists</h3>
          <form className="watchlist-add-form" onSubmit={handleAddWatchlist}>
            <div className="watchlist-add-form__field">
              <label className="watchlist-add-form__label" htmlFor="watchlist-category">
                Category
              </label>
              <select
                id="watchlist-category"
                className="watchlist-add-form__select"
                value={watchlistCategoryId}
                onChange={(e) => setWatchlistCategoryId(e.target.value)}
                aria-label="Watchlist category"
              >
                <option value="">Select category…</option>
                {categories
                  .filter((c) => !c.isIncome)
                  .map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="watchlist-add-form__field">
              <label className="watchlist-add-form__label" htmlFor="watchlist-threshold">
                Monthly limit ($)
              </label>
              <input
                id="watchlist-threshold"
                type="number"
                className="watchlist-add-form__input"
                value={watchlistThreshold}
                onChange={(e) => setWatchlistThreshold(e.target.value)}
                placeholder="0.00"
                min="0.01"
                step="0.01"
                aria-label="Monthly spending limit in dollars"
              />
            </div>
            <button
              type="submit"
              className="watchlist-add-form__button"
              disabled={!watchlistCategoryId || !watchlistThreshold}
            >
              Add Watchlist
            </button>
          </form>
          {watchlists.length === 0 ? (
            <p className="watchlist-section__empty">No spending watchlists configured</p>
          ) : (
            watchlists.map((ws) => (
              <div key={ws.watchlist.id} className="watchlist-item">
                <div className="watchlist-item__info">
                  <div className="watchlist-item__category">{ws.watchlist.categoryName}</div>
                  <div className="watchlist-item__amounts">
                    ${(ws.currentSpending / 100).toFixed(2)} of $
                    {(ws.watchlist.monthlyThreshold / 100).toFixed(2)}
                  </div>
                </div>
                <div className="watchlist-item__progress">
                  <div
                    className="watchlist-progress-bar"
                    role="progressbar"
                    aria-valuenow={Math.min(ws.percentage, 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${ws.watchlist.categoryName} spending progress`}
                  >
                    <div
                      className={`watchlist-progress-bar__fill watchlist-progress-bar__fill--${ws.status}`}
                      style={{ width: `${Math.min(ws.percentage, 100)}%` }}
                    />
                  </div>
                </div>
                <span
                  className={`watchlist-status-badge ${
                    ws.watchlist.isActive
                      ? `watchlist-status-badge--${ws.status}`
                      : 'watchlist-status-badge--inactive'
                  }`}
                >
                  {ws.watchlist.isActive ? ws.status : 'Inactive'}
                </span>
                <div className="watchlist-item__actions">
                  <button
                    type="button"
                    className="watchlist-item__action-btn"
                    onClick={() => toggleActive(ws.watchlist.id)}
                    aria-label={
                      ws.watchlist.isActive
                        ? `Pause ${ws.watchlist.categoryName} watchlist`
                        : `Resume ${ws.watchlist.categoryName} watchlist`
                    }
                  >
                    {ws.watchlist.isActive ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    type="button"
                    className="watchlist-item__action-btn watchlist-item__action-btn--danger"
                    onClick={() => removeWatchlist(ws.watchlist.id)}
                    aria-label={`Remove ${ws.watchlist.categoryName} watchlist`}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
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
          <button
            type="button"
            className="settings-item settings-item--button"
            onClick={() => {
              void handlePasskeyRegistration();
            }}
            disabled={!isAuthenticated || isPasskeyLoading}
            aria-label={user?.hasPasskey ? 'Passkeys — registered' : 'Passkeys — set up a passkey'}
          >
            <span className="settings-item__label">Passkeys</span>
            <span className="settings-item__value">
              {isPasskeyLoading ? 'Registering…' : user?.hasPasskey ? '✓ Registered' : 'Set up'}
            </span>
          </button>
          {passkeyMessage && (
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
          <DataExport />
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
        </div>
      </section>
      <section aria-label="About" className="page-section">
        <div className="settings-group">
          <h3 className="settings-group__title">About</h3>
          <div className="settings-item settings-item--static">
            <span className="settings-item__label">Version</span>
            <span className="settings-item__value">{APP_VERSION}</span>
          </div>
        </div>
      </section>
      <section aria-label="Danger zone" className="page-section">
        <div className="settings-group">
          <h3
            className="settings-group__title"
            style={{ color: 'var(--semantic-status-negative)' }}
          >
            Danger Zone
          </h3>
          <button
            type="button"
            className="settings-item settings-item--button settings-item--destructive"
            disabled
            aria-disabled="true"
            aria-label="Account deletion — available in a future update"
          >
            <span className="settings-item__label">Account Deletion</span>
            <span className="settings-item__value settings-item__value--muted">Coming soon</span>
          </button>
        </div>
      </section>
    </>
  );
};

export default SettingsPage;
