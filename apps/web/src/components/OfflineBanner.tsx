// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

import { useOfflineStatus } from '../hooks/useOfflineStatus';

import '../styles/offline-banner.css';

const cls = {
  banner: 'offline-banner',
  bannerHidden: 'offline-banner--hidden',
  icon: 'offline-banner__icon',
  text: 'offline-banner__text',
} as const;

/** Display a non-intrusive banner while the browser is offline. */
export const OfflineBanner: React.FC = () => {
  const { isOffline } = useOfflineStatus();

  return (
    <div
      className={`${cls.banner} ${isOffline ? '' : cls.bannerHidden}`.trim()}
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

export default OfflineBanner;
