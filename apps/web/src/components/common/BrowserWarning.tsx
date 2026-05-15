// SPDX-License-Identifier: BUSL-1.1

/**
 * BrowserWarning — Accessible banner that alerts users when their browser
 * is missing features required by the Finance PWA.
 *
 * Shows a dismissible warning listing missing features and suggesting
 * browser upgrades. Dismissal is persisted to `localStorage` so the
 * banner stays hidden across sessions.
 *
 * Accessibility:
 *   • Uses `role="alert"` for immediate screen-reader announcement.
 *   • Dismiss button has `aria-label` for icon-only content.
 *   • Focus is managed — the banner container receives focus on mount
 *     when visible, and focus returns to the document body on dismiss.
 *   • All interactive elements are keyboard-accessible.
 *
 * CSP-compliant — no inline styles; all styling via CSS class names.
 *
 * References: issue #1343
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { FeatureSupport } from '../../utils/browserCompat';

import './browser-warning.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DISMISS_KEY = 'finance-browser-warning-dismissed';

/** Recommended browsers with download links. */
const BROWSER_SUGGESTIONS = [
  { name: 'Google Chrome', url: 'https://www.google.com/chrome/' },
  { name: 'Mozilla Firefox', url: 'https://www.mozilla.org/firefox/' },
  { name: 'Microsoft Edge', url: 'https://www.microsoft.com/edge' },
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props for the {@link BrowserWarning} component. */
export interface BrowserWarningProps {
  /** List of features that are missing in the current browser. */
  missingFeatures: readonly FeatureSupport[];
  /** Optional CSS class name for the root element. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Warning banner displayed when the browser is missing required features.
 *
 * Renders nothing when:
 * - No features are missing
 * - The user has previously dismissed the banner (persisted in localStorage)
 */
export const BrowserWarning: React.FC<BrowserWarningProps> = ({
  missingFeatures,
  className = '',
}) => {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const bannerRef = useRef<HTMLDivElement>(null);

  // Focus the banner on mount when visible for screen readers.
  useEffect(() => {
    if (!dismissed && missingFeatures.length > 0 && bannerRef.current) {
      bannerRef.current.focus();
    }
  }, [dismissed, missingFeatures]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      // localStorage may be unavailable — dismiss for this session only.
    }
  }, []);

  // Don't render when there are no missing features or the banner was dismissed.
  if (dismissed || missingFeatures.length === 0) {
    return null;
  }

  const requiredMissing = missingFeatures.filter((f) => f.required);
  const optionalMissing = missingFeatures.filter((f) => !f.required);

  return (
    <div
      ref={bannerRef}
      className={`browser-warning ${className}`.trim()}
      role="alert"
      tabIndex={-1}
      aria-label="Browser compatibility warning"
    >
      <div className="browser-warning__content">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          focusable="false"
          className="browser-warning__icon"
        >
          <path
            d="M12 2L1 21h22L12 2zm0 4l7.53 13H4.47L12 6zm-1 5v4h2v-4h-2zm0 6v2h2v-2h-2z"
            fill="currentColor"
          />
        </svg>

        <div className="browser-warning__body">
          <h2 className="browser-warning__title" id="browser-warning-title">
            Your browser may not fully support this app
          </h2>

          {requiredMissing.length > 0 && (
            <div className="browser-warning__section">
              <p className="browser-warning__label">Missing required features:</p>
              <ul className="browser-warning__list" aria-label="Missing required browser features">
                {requiredMissing.map((feature) => (
                  <li key={feature.name} className="browser-warning__item">
                    {feature.name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {optionalMissing.length > 0 && (
            <div className="browser-warning__section">
              <p className="browser-warning__label">Missing optional features:</p>
              <ul className="browser-warning__list" aria-label="Missing optional browser features">
                {optionalMissing.map((feature) => (
                  <li key={feature.name} className="browser-warning__item">
                    {feature.name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="browser-warning__suggestion">
            For the best experience, try one of these browsers:
          </p>
          <ul className="browser-warning__browsers" aria-label="Recommended browsers">
            {BROWSER_SUGGESTIONS.map((browser) => (
              <li key={browser.name}>
                <a
                  href={browser.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="browser-warning__browser-link"
                >
                  {browser.name}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          className="browser-warning__dismiss"
          onClick={handleDismiss}
          aria-label="Dismiss browser warning"
        >
          &times;
        </button>
      </div>
    </div>
  );
};

export default BrowserWarning;
