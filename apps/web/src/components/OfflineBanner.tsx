// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

import { useOfflineStatus } from '../hooks/useOfflineStatus';

import '../styles/offline-banner.css';

const cls = {
  banner: 'offline-banner',
  bannerHidden: 'offline-banner--hidden',
  bannerReconnected: 'offline-banner--reconnected',
  icon: 'offline-banner__icon',
  text: 'offline-banner__text',
} as const;

/** How long the "back online" confirmation stays visible before auto-dismissing. */
export const RECONNECTED_CONFIRMATION_MS = 4000;

/** Copy shown briefly after connectivity is restored. */
const RECONNECTED_MESSAGE = 'Back online. Your changes are syncing.';

/** Slashed-cloud glyph shown while offline / degraded. */
const OfflineGlyph: React.FC = () => (
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
);

/** Check glyph shown on the reconnection confirmation. */
const ReconnectedGlyph: React.FC = () => (
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
    <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="currentColor" />
  </svg>
);

/**
 * Non-intrusive network banner.
 *
 * While offline or on a degraded connection it shows a warning message. When
 * connectivity is restored it briefly shows a positive reconnection
 * confirmation (#3661) so users get closure that queued changes will sync,
 * then auto-dismisses. The confirmation is only shown after an actual
 * offline/degraded → online transition — never on initial load while already
 * online.
 *
 * Announced politely via `role="status"` / `aria-live="polite"`. Motion is
 * handled by `offline-banner.css`, which disables the slide/fade transition
 * under `prefers-reduced-motion: reduce`, so both states are reduced-motion
 * safe.
 */
export const OfflineBanner: React.FC = () => {
  const { isOffline, isDegraded, degradedMessage } = useOfflineStatus();

  const wasDegradedRef = React.useRef(isDegraded);
  const [showReconnected, setShowReconnected] = React.useState(false);

  React.useEffect(() => {
    const wasDegraded = wasDegradedRef.current;
    wasDegradedRef.current = isDegraded;

    if (isDegraded) {
      // A fresh degradation supersedes any lingering confirmation.
      setShowReconnected(false);
      return undefined;
    }

    if (wasDegraded) {
      // Transitioned degraded/offline → online: confirm and auto-dismiss.
      setShowReconnected(true);
      const timer = setTimeout(() => setShowReconnected(false), RECONNECTED_CONFIRMATION_MS);
      return () => clearTimeout(timer);
    }

    return undefined;
  }, [isDegraded]);

  const isVisible = isDegraded || showReconnected;
  const isReconnected = showReconnected && !isDegraded;

  const className = [
    cls.banner,
    isReconnected ? cls.bannerReconnected : '',
    isVisible ? '' : cls.bannerHidden,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-network-state={
        isOffline ? 'offline' : isDegraded ? 'degraded' : isReconnected ? 'reconnected' : 'online'
      }
    >
      {isReconnected ? <ReconnectedGlyph /> : <OfflineGlyph />}
      <span className={cls.text}>{isReconnected ? RECONNECTED_MESSAGE : degradedMessage}</span>
    </div>
  );
};

export default OfflineBanner;
