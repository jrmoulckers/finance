// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useState } from 'react';
import { Link } from 'react-router';

import packageJson from '../../../package.json';

const BUILD_SHA =
  import.meta.env.VITE_BUILD_SHA ??
  import.meta.env.VITE_GIT_SHA ??
  import.meta.env.VITE_COMMIT_SHA ??
  '';

const SHORT_BUILD_SHA = BUILD_SHA ? BUILD_SHA.slice(0, 12) : 'Not available in this build';

const BUILD_DATE_RAW = import.meta.env.VITE_BUILD_DATE ?? '';

/** Human-readable build date, or a clear fallback when it wasn't injected. */
const BUILD_DATE = (() => {
  if (!BUILD_DATE_RAW) {
    return 'Not recorded in this build';
  }
  const parsed = new Date(BUILD_DATE_RAW);
  return Number.isNaN(parsed.getTime()) ? BUILD_DATE_RAW : parsed.toISOString().slice(0, 10);
})();

const RELEASE_NOTES_URL = 'https://github.com/jrmoulckers/finance/releases';

/**
 * About sub-page — app metadata, license, and acknowledgements.
 *
 * Adds a build date, a release-notes link, and a "Copy diagnostics" action so
 * users can share environment details with support without exposing any
 * financial data (see issue #3788, item 12).
 */
export const SettingsAboutPage: React.FC = () => {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  const handleCopyDiagnostics = useCallback(async () => {
    const diagnostics = [
      `App version: ${packageJson.version}`,
      `Build SHA: ${SHORT_BUILD_SHA}`,
      `Build date: ${BUILD_DATE}`,
      `User agent: ${typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent}`,
    ].join('\n');

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(diagnostics);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  }, []);

  return (
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
          <div className="settings-item settings-item--static">
            <span className="settings-item__label">Build date</span>
            <span className="settings-item__value">{BUILD_DATE}</span>
          </div>
          <a
            className="settings-item settings-item--button"
            href={RELEASE_NOTES_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Open release notes"
          >
            <span className="settings-item__label">Release notes</span>
            <span className="settings-item__value">What&apos;s new ›</span>
          </a>
          <button
            type="button"
            className="settings-item settings-item--button"
            onClick={() => {
              void handleCopyDiagnostics();
            }}
            aria-label="Copy diagnostics for support"
            aria-describedby="settings-diagnostics-help"
          >
            <span className="settings-item__label">Copy diagnostics</span>
            <span className="settings-item__value">
              {copyStatus === 'copied'
                ? 'Copied ✓'
                : copyStatus === 'error'
                  ? 'Copy failed'
                  : 'Copy'}
            </span>
          </button>
          <p id="settings-diagnostics-help" className="settings-item__description">
            Copies version, build, and browser details — no financial data — so you can paste them
            into a support request.
          </p>
          <p className="sr-only" role="status" aria-live="polite">
            {copyStatus === 'copied'
              ? 'Diagnostics copied to clipboard.'
              : copyStatus === 'error'
                ? 'Could not copy diagnostics to clipboard.'
                : ''}
          </p>
        </div>
      </section>

      <section aria-label="Legal" className="page-section">
        <div className="settings-group">
          <h3 className="settings-group__title">Legal</h3>
          <Link
            className="settings-item settings-item--button"
            to="/legal"
            aria-label="Open Legal index"
          >
            <span className="settings-item__label">Legal documents</span>
            <span className="settings-item__value">Privacy, Terms, CCPA</span>
          </Link>
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
              Built with React, Vite, TypeScript, sql.js, wa-sqlite, Recharts, D3, and Tesseract.js.
            </span>
          </div>
        </div>
      </section>
    </>
  );
};

export default SettingsAboutPage;
