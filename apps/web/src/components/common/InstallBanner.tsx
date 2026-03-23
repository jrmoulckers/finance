// SPDX-License-Identifier: BUSL-1.1

/**
 * InstallBanner — a non-intrusive banner prompting the user to install
 * the Finance PWA for quick access.
 *
 * Only renders when the browser has fired `beforeinstallprompt` and the
 * user has not previously dismissed the banner.  The dismiss action
 * persists to `localStorage` so the banner stays hidden across sessions.
 *
 * Accessibility:
 *   • Uses `role="complementary"` with a descriptive `aria-label` so
 *     assistive technologies can identify the region.
 *   • All interactive elements are keyboard-accessible.
 *   • Respects `prefers-reduced-motion` via CSS (no JS animation).
 *
 * CSP-compliant — no inline styles; all styling via class names in the
 * companion stylesheet section of `responsive.css`.
 *
 * References: issue #550
 */

import React from 'react';

import { useInstallPrompt } from '../../hooks/useInstallPrompt';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * A subtle bottom-of-screen banner that offers PWA installation.
 *
 * Renders nothing when the install prompt is unavailable or dismissed.
 */
export const InstallBanner: React.FC = () => {
  const { canInstall, install, dismiss } = useInstallPrompt();

  if (!canInstall) {
    return null;
  }

  const handleInstall = () => {
    void install();
  };

  return (
    <aside className="install-banner" role="complementary" aria-label="Install application">
      <p className="install-banner__text">Install Finance for quick access</p>
      <div className="install-banner__actions">
        <button
          type="button"
          className="install-banner__button install-banner__button--primary"
          onClick={handleInstall}
        >
          Install
        </button>
        <button
          type="button"
          className="install-banner__button install-banner__button--dismiss"
          onClick={dismiss}
          aria-label="Dismiss install banner"
        >
          Not now
        </button>
      </div>
    </aside>
  );
};

export default InstallBanner;
