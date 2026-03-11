// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
export const SettingsPage: React.FC = () => (
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
        <div className="settings-item" role="button" tabIndex={0}>
          <span className="settings-item__label">Currency</span>
          <span className="settings-item__value">USD ($)</span>
        </div>
        <div className="settings-item" role="button" tabIndex={0}>
          <span className="settings-item__label">Theme</span>
          <span className="settings-item__value">System</span>
        </div>
        <div className="settings-item">
          <label className="settings-item__label" htmlFor="s-notif">
            Notifications
          </label>
          <input
            type="checkbox"
            id="s-notif"
            defaultChecked
            style={{
              width: '20px',
              height: '20px',
              accentColor: 'var(--semantic-interactive-default)',
            }}
          />
        </div>
      </div>
    </section>
    <section aria-label="Security" className="page-section">
      <div className="settings-group">
        <h3 className="settings-group__title">Security</h3>
        <div className="settings-item" role="button" tabIndex={0}>
          <span className="settings-item__label">Biometric Lock</span>
          <span className="settings-item__value">Off</span>
        </div>
        <div className="settings-item" role="button" tabIndex={0}>
          <span className="settings-item__label">Passkeys</span>
          <span className="settings-item__value">Not set up</span>
        </div>
      </div>
    </section>
    <section aria-label="Data" className="page-section">
      <div className="settings-group">
        <h3 className="settings-group__title">Data</h3>
        <div className="settings-item" role="button" tabIndex={0}>
          <span className="settings-item__label">Export Data</span>
          <span className="settings-item__value">&rarr;</span>
        </div>
        <div className="settings-item" role="button" tabIndex={0}>
          <span className="settings-item__label">Sync Status</span>
          <span className="settings-item__value">Up to date</span>
        </div>
      </div>
    </section>
    <section aria-label="About" className="page-section">
      <div className="settings-group">
        <h3 className="settings-group__title">About</h3>
        <div className="settings-item">
          <span className="settings-item__label">Version</span>
          <span className="settings-item__value">0.1.0</span>
        </div>
      </div>
    </section>
    <section aria-label="Danger zone" className="page-section">
      <div className="settings-group">
        <h3 className="settings-group__title" style={{ color: 'var(--semantic-status-negative)' }}>
          Danger Zone
        </h3>
        <div
          className="settings-item settings-item--destructive"
          role="button"
          tabIndex={0}
          aria-label="Delete all data"
        >
          <span className="settings-item__label">Delete All Data</span>
        </div>
      </div>
    </section>
  </>
);
export default SettingsPage;
