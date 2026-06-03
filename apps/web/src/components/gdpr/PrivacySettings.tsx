// SPDX-License-Identifier: BUSL-1.1

/**
 * PrivacySettings — GDPR privacy settings panel for the Settings page.
 *
 * Provides:
 *   - Granular consent management per category
 *   - Data export trigger (GDPR data portability)
 *   - Account deletion request flow
 *   - Consent record display
 *
 * Integrated into the Settings page as a dedicated section.
 *
 * References: issue #443 (GDPR consent — critical legal blocker)
 */

import React, { useCallback, useState } from 'react';
import { useConsent } from '../../hooks/useConsent';
import {
  CONSENT_DESCRIPTIONS,
  CONSENT_LABELS,
  CURRENT_POLICY_VERSION,
  exportConsentRecord,
  type ConsentCategory,
} from '../../lib/consent-storage';
import './privacy-settings.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const TOGGLEABLE_CATEGORIES: ConsentCategory[] = [
  'analytics',
  'error_reporting',
  'sync',
  'marketing',
];

export interface PrivacySettingsProps {
  /** Callback to trigger GDPR data export. */
  onExportData?: () => void;
  /** Callback to trigger account deletion flow. */
  onDeleteAccount?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PrivacySettings: React.FC<PrivacySettingsProps> = ({
  onExportData,
  onDeleteAccount,
}) => {
  const { consent, updateCategory } = useConsent();
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const handleToggle = useCallback(
    (category: ConsentCategory) => {
      updateCategory(category, !consent.categories[category]);
    },
    [consent.categories, updateCategory],
  );

  const handleExportConsent = useCallback(() => {
    try {
      const data = exportConsentRecord();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `finance-consent-record-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        document.body.removeChild(anchor);
      }, 100);
      setExportMessage('Consent record exported successfully.');
      setTimeout(() => setExportMessage(null), 4000);
    } catch {
      setExportMessage('Failed to export consent record.');
    }
  }, []);

  /**
   * Open the typed-DELETE confirmation modal (issue #1961).
   *
   * Previously this component rendered its own two-step inline
   * "Are you sure? Yes, Delete Everything" confirmation that had NO
   * typed-confirmation gate. The "Yes" button only invoked
   * `onDeleteAccount` (which then opened the proper typed-DELETE
   * modal), but the duplicated copy made users believe the deletion
   * had already fired. We've collapsed it into a single click that
   * hands off to the parent's typed-DELETE modal — the single source
   * of truth for the gate.
   */
  const handleDeleteRequest = useCallback(() => {
    // Local consent state is cleared in SettingsPage's success path
    // (after the server confirms the deletion) via localStorage.clear().
    // Clearing here would race with the user cancelling the modal.
    onDeleteAccount?.();
  }, [onDeleteAccount]);

  return (
    <section aria-label="Privacy & Data" className="page-section">
      <div className="settings-group">
        <h3 className="settings-group__title">Privacy & Data</h3>

        <p className="privacy-settings__info">
          Manage how your data is used. Privacy policy version: {CURRENT_POLICY_VERSION}.
          {consent.timestamp && (
            <> Last updated: {new Date(consent.timestamp).toLocaleDateString()}.</>
          )}
        </p>

        {/* Essential (always on) */}
        <div className="settings-item settings-item--static">
          <div>
            <span className="settings-item__label">{CONSENT_LABELS.essential}</span>
            <p className="privacy-settings__category-description">
              {CONSENT_DESCRIPTIONS.essential}
            </p>
          </div>
          <input
            type="checkbox"
            checked
            disabled
            aria-label={`${CONSENT_LABELS.essential} — always required`}
            className="settings-item__checkbox"
          />
        </div>

        {/* Toggleable categories */}
        {TOGGLEABLE_CATEGORIES.map((category) => (
          <div key={category} className="settings-item settings-item--static">
            <div>
              <label htmlFor={`privacy-${category}`} className="settings-item__label">
                {CONSENT_LABELS[category]}
              </label>
              <p className="privacy-settings__category-description">
                {CONSENT_DESCRIPTIONS[category]}
              </p>
            </div>
            <input
              id={`privacy-${category}`}
              type="checkbox"
              checked={consent.categories[category]}
              onChange={() => handleToggle(category)}
              aria-label={CONSENT_LABELS[category]}
              className="settings-item__checkbox"
            />
          </div>
        ))}
      </div>

      {/* Data Portability */}
      <div className="settings-group privacy-settings__group-spacer">
        <h3 className="settings-group__title">Data Portability</h3>

        <button
          type="button"
          className="settings-item settings-item--button"
          onClick={onExportData}
          aria-label="Export all financial data (GDPR data portability)"
        >
          <span className="settings-item__label">Export All Data</span>
          <span className="settings-item__value">JSON / CSV</span>
        </button>

        <button
          type="button"
          className="settings-item settings-item--button"
          onClick={handleExportConsent}
          aria-label="Export consent record"
        >
          <span className="settings-item__label">Export Consent Record</span>
          <span className="settings-item__value">JSON</span>
        </button>

        {exportMessage && (
          <div className="settings-item settings-item--static" role="status" aria-live="polite">
            <span className="settings-item__value">{exportMessage}</span>
          </div>
        )}
      </div>

      {/* Account Deletion */}
      <div className="settings-group privacy-settings__group-spacer">
        <h3 className="settings-group__title privacy-settings__danger-title">
          Account & Data Deletion
        </h3>

        <p className="privacy-settings__danger-info">
          Permanently delete your account and all associated data. This action cannot be undone. We
          recommend exporting your data first.
        </p>

        <button
          type="button"
          className="settings-item settings-item--button settings-item--destructive"
          onClick={handleDeleteRequest}
          aria-label="Delete my account and all data"
        >
          <span className="settings-item__label">Delete My Account & Data</span>
          <span className="settings-item__value">&rarr;</span>
        </button>
      </div>
    </section>
  );
};

export default PrivacySettings;
