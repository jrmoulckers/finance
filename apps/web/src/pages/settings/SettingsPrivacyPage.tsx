// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useState } from 'react';

import { DataExport } from '../../components/DataExport';
import { CrashReportingSettings, PrivacySettings } from '../../components/gdpr';
import { useAccountDeletion } from '../../components/settings/AccountDeletionModal';
import { PrivacyPersistenceOption, usePrivacyMode } from '../../contexts/PrivacyModeContext';
import { useAuth } from '../../auth/auth-context';
import { initMonitoring } from '../../lib/monitoring';

const MONITORING_CONSENT_STORAGE_KEY = 'finance-monitoring-consent';

/**
 * Privacy & Data sub-page — privacy mode, monitoring/error reporting,
 * GDPR consent, data export, and the account-deletion entry point.
 */
export const SettingsPrivacyPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { isPrivacyMode, togglePrivacyMode, persistence, setPersistence, firstActivationMessage } =
    usePrivacyMode();
  const [monitoringEnabled, setMonitoringEnabled] = useState(
    () => localStorage.getItem(MONITORING_CONSENT_STORAGE_KEY) === 'true',
  );

  const { openDeleteModal, deleteModal } = useAccountDeletion();

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

  const handleMonitoringToggle = useCallback((enabled: boolean) => {
    localStorage.setItem(MONITORING_CONSENT_STORAGE_KEY, String(enabled));
    setMonitoringEnabled(enabled);

    if (enabled) {
      initMonitoring();
    }
  }, []);

  return (
    <>
      <h2 className="settings-subpage__title">Privacy &amp; Data</h2>

      <section aria-label="Privacy Mode" className="page-section">
        <div className="settings-group">
          <h3 className="settings-group__title">Privacy mode</h3>
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

      <section aria-label="Error Reporting" className="page-section">
        <div className="settings-group">
          <h3 className="settings-group__title">Error reporting</h3>
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

      <section aria-label="Data" className="page-section">
        <div className="settings-group">
          <h3 className="settings-group__title">Data</h3>
          <DataExport />
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

      <CrashReportingSettings enabled={monitoringEnabled} onToggle={handleMonitoringToggle} />

      {deleteModal}
    </>
  );
};

export default SettingsPrivacyPage;
