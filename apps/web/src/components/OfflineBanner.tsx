// SPDX-License-Identifier: BUSL-1.1

/**
 * OfflineBanner ΓÇö displays a non-intrusive banner when the browser
 * loses network connectivity.
 *
 * Accessibility:
 *   ΓÇó Uses `role="status"` with `aria-live="polite"` so screen readers
 *     announce the connectivity change without interrupting the user.
 *   ΓÇó Respects `prefers-reduced-motion` ΓÇö the slide-in animation is
 *     disabled when the user prefers reduced motion.
 *   ΓÇó Respects `prefers-color-scheme` ΓÇö adjusts banner colours for
 *     dark-mode users.
 *   ΓÇó Respects `prefers-contrast` ΓÇö uses higher-contrast colours when
 *     the user prefers more contrast.
 *
 * No inline styles ΓÇö all styling is via the companion CSS file to
 * stay CSP-compliant (no `style-src 'unsafe-inline'`).
 *
 * References: issues #57, #58
 */

import React from 'react';
import { useOfflineStatus } from '../hooks/useOfflineStatus';

// ---------------------------------------------------------------------------
// CSS class names consumed by this component.
// Map to the companion stylesheet `offline-banner.css`.
// ---------------------------------------------------------------------------

const cls = {
  banner: 'offline-banner',
  bannerHidden: 'offline-banner--hidden',
  icon: 'offline-banner__icon',
  text: 'offline-banner__text',
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const OfflineBanner: React.FC = () => {
  const { isOffline } = useOfflineStatus();

  return (
    <div
      className={`${cls.banner} ${isOffline ? '' : cls.bannerHidden}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <svg
        className={cls.icon}
        aria-hidden="true"
        focusable="false"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Cloud-off icon (Material Design) */}
        <path
          d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4s1.79-4 4-4h.71C7.37 7.69 9.48 6 12 6a5.5 5.5 0 0 1 5.35 4.16l.34 1.34H19c1.66 0 3 1.34 3 3s-1.34 3-3 3z"
          fill="currentColor"
        />
        <line
          x1="1"
          y1="1"
          x2="23"
          y2="23"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span className={cls.text}>
        You are offline. Changes will sync when connectivity is restored.
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Companion stylesheet ΓÇö place in src/styles/offline-banner.css
// and import from the app entry point.
// ---------------------------------------------------------------------------
//
// .offline-banner {
//   display: flex;
//   align-items: center;
//   gap: 0.5rem;
//   padding: 0.625rem 1rem;
//   background-color: #fff3e0;
//   color: #e65100;
//   font-size: 0.875rem;
//   line-height: 1.4;
//   border-bottom: 2px solid #e65100;
//   transform: translateY(0);
//   transition: transform 0.3s ease, opacity 0.3s ease;
//   opacity: 1;
// }
//
// .offline-banner--hidden {
//   transform: translateY(-100%);
//   opacity: 0;
//   pointer-events: none;
// }
//
// .offline-banner__icon {
//   flex-shrink: 0;
// }
//
// .offline-banner__text {
//   flex: 1;
// }
//
// /* Accessibility: disable animation for users who prefer reduced motion */
// @media (prefers-reduced-motion: reduce) {
//   .offline-banner {
//     transition: none;
//   }
// }
//
// /* Dark mode adaptation */
// @media (prefers-color-scheme: dark) {
//   .offline-banner {
//     background-color: #3e2723;
//     color: #ffcc80;
//     border-bottom-color: #ffcc80;
//   }
// }
//
// /* High contrast adaptation */
// @media (prefers-contrast: more) {
//   .offline-banner {
//     background-color: #000;
//     color: #fff;
//     border-bottom-color: #fff;
//   }
// }
