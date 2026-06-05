// SPDX-License-Identifier: BUSL-1.1

/**
 * PrivacyDashboardPage — comprehensive privacy dashboard.
 *
 * Shows:
 *   - All locally stored data categories with descriptions
 *   - Storage usage per category and overall
 *   - Granular consent management with one-click withdrawal
 *   - Consent history timeline with proof
 *   - Links to export and delete functionality
 *
 * References:
 *   - issue #1636 (privacy dashboard with full data inventory)
 *   - issue #1641 (granular consent management with proof)
 *   - issue #1612 (privacy-first app shell)
 */

import React, { useCallback, useState } from 'react';
import { useConsent } from '../hooks/useConsent';
import { useConsentHistory } from '../hooks/useConsentHistory';
import { usePrivacyDashboard } from '../hooks/usePrivacyDashboard';
import { ConsentHistoryViewer } from '../components/gdpr/ConsentHistoryViewer';
import {
  CONSENT_LABELS,
  CONSENT_DESCRIPTIONS,
  exportConsentRecord,
  type ConsentCategory,
} from '../lib/consent-storage';
import './PrivacyDashboardPage.css';
import { AppIcon } from '../components/icons';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Toggleable consent categories (essential is always on). */
const TOGGLEABLE_CATEGORIES: ConsentCategory[] = [
  'analytics',
  'error_reporting',
  'sync',
  'marketing',
];

/** Format bytes to a human-readable string. */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Privacy Dashboard — full data inventory and consent management. */
const PrivacyDashboardPage: React.FC = () => {
  const { consent, updateCategory } = useConsent();
  const { recordChange } = useConsentHistory();
  const { categories, storageQuota, loading, error } = usePrivacyDashboard();
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const handleToggleConsent = useCallback(
    (category: ConsentCategory) => {
      const newValue = !consent.categories[category];
      updateCategory(category, newValue);
      recordChange(category, newValue, 'dashboard');
    },
    [consent.categories, updateCategory, recordChange],
  );

  const handleExportConsent = useCallback(() => {
    try {
      const data = exportConsentRecord();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `consent-record-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        document.body.removeChild(anchor);
      }, 100);
      setExportMessage('Consent record exported.');
      setTimeout(() => setExportMessage(null), 4000);
    } catch {
      setExportMessage('Failed to export.');
    }
  }, []);

  return (
    <main className="privacy-dashboard" aria-label="Privacy Dashboard">
      <header className="privacy-dashboard__header">
        <h1 className="privacy-dashboard__title">Privacy Dashboard</h1>
        <p className="privacy-dashboard__subtitle">
          Full transparency into what data is stored on your device and how it is used.
        </p>
      </header>

      {/* Storage Overview */}
      {storageQuota && (
        <section className="privacy-dashboard__section" aria-label="Storage usage">
          <h2 className="privacy-dashboard__section-title">Storage Usage</h2>
          <div className="privacy-dashboard__storage-overview">
            <div
              className="privacy-dashboard__storage-bar"
              role="progressbar"
              aria-valuenow={storageQuota.usagePercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Storage: ${formatBytes(storageQuota.usage)} of ${formatBytes(storageQuota.quota)} used`}
            >
              <div
                className="privacy-dashboard__storage-fill"
                style={{ width: `${Math.min(storageQuota.usagePercent, 100)}%` }}
              />
            </div>
            <div className="privacy-dashboard__storage-labels">
              <span>{formatBytes(storageQuota.usage)} used</span>
              <span>{formatBytes(storageQuota.quota)} total</span>
            </div>
          </div>
        </section>
      )}

      {/* Data Inventory */}
      <section className="privacy-dashboard__section" aria-label="Data inventory">
        <h2 className="privacy-dashboard__section-title">What We Store</h2>
        <p className="privacy-dashboard__section-description">
          All your financial data is stored locally in your browser. Nothing leaves your device
          unless you explicitly enable Cloud Sync.
        </p>

        {loading && (
          <div role="status" aria-live="polite" className="privacy-dashboard__loading">
            Loading data inventory…
          </div>
        )}

        {error && (
          <div role="alert" className="privacy-dashboard__error">
            {error}
          </div>
        )}

        {!loading && (
          <div className="privacy-dashboard__categories">
            {categories.map((category) => (
              <article
                key={category.id}
                className="privacy-dashboard__category-card"
                aria-label={category.name}
              >
                <div className="privacy-dashboard__category-icon" aria-hidden="true">
                  <AppIcon name={category.icon} />
                </div>
                <div className="privacy-dashboard__category-content">
                  <h3 className="privacy-dashboard__category-name">{category.name}</h3>
                  <p className="privacy-dashboard__category-description">{category.description}</p>
                  <div className="privacy-dashboard__category-meta">
                    <span className="privacy-dashboard__category-storage">
                      <AppIcon name="package" /> {category.storageLocation}
                    </span>
                    {category.leavesDevice ? (
                      <span className="privacy-dashboard__category-leaves">
                        <AppIcon name="cloud" /> {category.leavesDeviceCondition ?? 'May sync'}
                      </span>
                    ) : (
                      <span className="privacy-dashboard__category-local">
                        <AppIcon name="lock" /> Stays on device
                      </span>
                    )}
                    {category.estimatedBytes > 0 && (
                      <span className="privacy-dashboard__category-size">
                        {formatBytes(category.estimatedBytes)}
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Consent Management */}
      <section className="privacy-dashboard__section" aria-label="Consent management">
        <h2 className="privacy-dashboard__section-title">Consent Management</h2>
        <p className="privacy-dashboard__section-description">
          Control exactly how your data is used. Toggle any category off to immediately withdraw
          consent.
        </p>

        {/* Essential (always on) */}
        <div className="privacy-dashboard__consent-item privacy-dashboard__consent-item--essential">
          <div className="privacy-dashboard__consent-info">
            <span className="privacy-dashboard__consent-label">
              {CONSENT_LABELS.essential}
              <span className="privacy-dashboard__consent-required"> (Required)</span>
            </span>
            <p className="privacy-dashboard__consent-description">
              {CONSENT_DESCRIPTIONS.essential}
            </p>
          </div>
          <input
            type="checkbox"
            checked
            disabled
            aria-label={`${CONSENT_LABELS.essential} — always required`}
            className="privacy-dashboard__consent-toggle"
          />
        </div>

        {/* Toggleable categories */}
        {TOGGLEABLE_CATEGORIES.map((category) => (
          <div key={category} className="privacy-dashboard__consent-item">
            <div className="privacy-dashboard__consent-info">
              <label htmlFor={`consent-${category}`} className="privacy-dashboard__consent-label">
                {CONSENT_LABELS[category]}
              </label>
              <p className="privacy-dashboard__consent-description">
                {CONSENT_DESCRIPTIONS[category]}
              </p>
            </div>
            <input
              id={`consent-${category}`}
              type="checkbox"
              checked={consent.categories[category]}
              onChange={() => handleToggleConsent(category)}
              aria-label={`${consent.categories[category] ? 'Withdraw' : 'Grant'} consent for ${CONSENT_LABELS[category]}`}
              className="privacy-dashboard__consent-toggle"
            />
          </div>
        ))}

        {consent.timestamp && (
          <p className="privacy-dashboard__consent-timestamp">
            Last updated: {new Date(consent.timestamp).toLocaleString()}
          </p>
        )}

        <div className="privacy-dashboard__consent-actions">
          <button
            type="button"
            className="privacy-dashboard__action-btn"
            onClick={handleExportConsent}
            aria-label="Export consent record as JSON"
          >
            Export Consent Record
          </button>
        </div>

        {exportMessage && (
          <div role="status" aria-live="polite" className="privacy-dashboard__status">
            {exportMessage}
          </div>
        )}
      </section>

      {/* Consent History */}
      <section className="privacy-dashboard__section" aria-label="Consent history">
        <ConsentHistoryViewer />
      </section>

      {/* Data Actions */}
      <section className="privacy-dashboard__section" aria-label="Data actions">
        <h2 className="privacy-dashboard__section-title">Your Data Rights</h2>
        <div className="privacy-dashboard__rights">
          <article className="privacy-dashboard__right-card">
            <h3 className="privacy-dashboard__right-title">
              <AppIcon name="download" /> Export Your Data
            </h3>
            <p className="privacy-dashboard__right-description">
              Download all your financial data in JSON or CSV format. This is your data — you can
              take it with you at any time.
            </p>
            <a href="/settings" className="privacy-dashboard__right-link">
              Go to Settings → Export
            </a>
          </article>
          <article className="privacy-dashboard__right-card">
            <h3 className="privacy-dashboard__right-title">
              <AppIcon name="trash" /> Delete Your Data
            </h3>
            <p className="privacy-dashboard__right-description">
              Permanently delete all your data from this device. If you have an account, you can
              also request server-side deletion.
            </p>
            <a href="/settings" className="privacy-dashboard__right-link">
              Go to Settings → Delete
            </a>
          </article>
        </div>
      </section>
    </main>
  );
};

export default PrivacyDashboardPage;
