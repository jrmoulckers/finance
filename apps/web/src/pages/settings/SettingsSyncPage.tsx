// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useState } from 'react';

import { useAuth } from '../../auth/auth-context';
import {
  getPreferredAuthMethod,
  setPreferredAuthMethod,
  type PreferredAuthMethod,
} from '../../auth/preferred-auth-method';
import { SettingInfoWidget } from '../../components/settings';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';

/**
 * Sync & Devices sub-page — sync status, passkey management,
 * and other device-level security controls.
 */
export const SettingsSyncPage: React.FC = () => {
  const {
    isAuthenticated,
    user,
    registerNewPasskey,
    webAuthnSupported,
    isDemoMode: demoModeActive,
  } = useAuth();
  const { isOffline } = useOfflineStatus();
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [passkeyMessage, setPasskeyMessage] = useState<string | null>(null);
  /**
   * Persisted preferred sign-in method (#1983). Stored in localStorage by
   * `preferred-auth-method.ts`. `null` means the user hasn't decided yet.
   */
  const [preferredAuth, setPreferredAuthState] = useState<PreferredAuthMethod | null>(() =>
    getPreferredAuthMethod(),
  );

  const handlePreferredAuthChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value as PreferredAuthMethod;
    setPreferredAuthMethod(next);
    setPreferredAuthState(next);
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

  return (
    <>
      <h2 className="settings-subpage__title">Sync &amp; Devices</h2>

      <section aria-label="Sync" className="page-section">
        <div className="settings-group">
          <h3 className="settings-group__title">Sync</h3>
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

      <section aria-label="Devices" className="page-section">
        <div className="settings-group">
          <h3 className="settings-group__title">Devices</h3>
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
          {!demoModeActive && (
            <div className="settings-item settings-item--select">
              <label htmlFor="settings-preferred-auth-method" className="settings-item__label">
                Preferred sign-in method
              </label>
              <select
                id="settings-preferred-auth-method"
                className="settings-item__value"
                value={preferredAuth ?? 'password'}
                onChange={handlePreferredAuthChange}
                aria-describedby="settings-preferred-auth-method-help"
              >
                <option value="password">Password (default)</option>
                <option value="passkey" disabled={!webAuthnSupported}>
                  Passkey (biometrics)
                  {!webAuthnSupported ? ' — not supported in this browser' : ''}
                </option>
              </select>
              <p id="settings-preferred-auth-method-help" className="settings-item__help">
                Controls which option is shown first on the sign-in page.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
};

export default SettingsSyncPage;
