// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

import packageJson from '../../../package.json';

const BUILD_SHA =
  import.meta.env.VITE_BUILD_SHA ??
  import.meta.env.VITE_GIT_SHA ??
  import.meta.env.VITE_COMMIT_SHA ??
  '';

const SHORT_BUILD_SHA = BUILD_SHA ? BUILD_SHA.slice(0, 12) : 'Not available in this build';

/**
 * About sub-page — app metadata, license, and acknowledgements.
 */
export const SettingsAboutPage: React.FC = () => (
  <>
    <h2 className="settings-subpage__title">About</h2>

    <section aria-label="About" className="page-section">
      <div className="settings-group">
        <h3 className="settings-group__title">App</h3>
        <div className="settings-item settings-item--static">
          <span className="settings-item__label">Version</span>
          <span className="settings-item__value">{packageJson.version}</span>
        </div>
        <div className="settings-item settings-item--static">
          <span className="settings-item__label">Build SHA</span>
          <span className="settings-item__value">{SHORT_BUILD_SHA}</span>
        </div>
      </div>
    </section>

    <section aria-label="Legal" className="page-section">
      <div className="settings-group">
        <h3 className="settings-group__title">Legal</h3>
        <a
          className="settings-item settings-item--button"
          href="https://github.com/jrmoulckers/finance/blob/main/LICENSE"
          target="_blank"
          rel="noreferrer"
          aria-label="Open Business Source License"
        >
          <span className="settings-item__label">License</span>
          <span className="settings-item__value">BUSL-1.1</span>
        </a>
      </div>
    </section>

    <section aria-label="Credits and acknowledgements" className="page-section">
      <div className="settings-group">
        <h3 className="settings-group__title">Credits</h3>
        <div className="settings-item settings-item--static">
          <span className="settings-item__label">Acknowledgements</span>
          <span className="settings-item__value">
            Built with React, Vite, TypeScript, sql.js, wa-sqlite, Recharts, D3, and
            Tesseract.js.
          </span>
        </div>
      </div>
    </section>
  </>
);

export default SettingsAboutPage;
