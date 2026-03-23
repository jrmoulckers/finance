// SPDX-License-Identifier: BUSL-1.1

/**
 * Alert banner displayed when spending watchlist thresholds are approached or
 * exceeded. Renders at the top of the app shell, below the header.
 *
 * - `role="alert"` for exceeded items (assertive announcement).
 * - `role="status"` for warning items (polite announcement).
 * - Expandable list when multiple alerts exist.
 * - Session-dismissible via Dismiss button.
 *
 * References: issue #316
 */

import React, { useState } from 'react';

import type { WatchlistStatus } from '../../hooks/useSpendingWatchlist';

import '../../styles/watchlist.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WatchlistAlertBannerProps {
  alerts: WatchlistStatus[];
  onDismiss?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDollars(cents: number): string {
  const abs = Math.abs(cents);
  return `$${(abs / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function alertMessage(alert: WatchlistStatus): string {
  const name = alert.watchlist.categoryName;
  const pct = alert.percentage;
  const limit = formatDollars(alert.watchlist.monthlyThreshold);

  if (alert.status === 'exceeded') {
    return `${name} spending at ${pct}% of ${limit} limit — exceeded!`;
  }
  return `${name} spending at ${pct}% of ${limit} limit`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const WatchlistAlertBanner: React.FC<WatchlistAlertBannerProps> = ({
  alerts,
  onDismiss,
}) => {
  const [expanded, setExpanded] = useState(false);

  if (alerts.length === 0) return null;

  const hasExceeded = alerts.some((a) => a.status === 'exceeded');
  const topAlert = alerts[0]!;
  const remaining = alerts.length - 1;

  // Use role="alert" for exceeded (assertive) and role="status" for warning.
  const bannerRole = hasExceeded ? 'alert' : 'status';

  const bannerClass = [
    'watchlist-alert-banner',
    hasExceeded ? 'watchlist-alert-banner--exceeded' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={bannerClass} role={bannerRole} aria-live={hasExceeded ? 'assertive' : 'polite'}>
      <div className="watchlist-alert-banner__header">
        {/* Warning / error icon */}
        <svg
          className="watchlist-alert-banner__icon"
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <p className="watchlist-alert-banner__message">
          {alertMessage(topAlert)}
          {remaining > 0 && !expanded && (
            <>
              {' '}
              <button
                type="button"
                className="watchlist-alert-banner__toggle"
                onClick={() => setExpanded(true)}
                aria-expanded={false}
                aria-controls="watchlist-alert-list"
              >
                +{remaining} more
              </button>
            </>
          )}
          {remaining > 0 && expanded && (
            <>
              {' '}
              <button
                type="button"
                className="watchlist-alert-banner__toggle"
                onClick={() => setExpanded(false)}
                aria-expanded={true}
                aria-controls="watchlist-alert-list"
              >
                Show less
              </button>
            </>
          )}
        </p>

        {onDismiss && (
          <button
            type="button"
            className="watchlist-alert-banner__dismiss"
            onClick={onDismiss}
            aria-label="Dismiss spending alerts"
          >
            ×
          </button>
        )}
      </div>

      {expanded && remaining > 0 && (
        <ul id="watchlist-alert-list" className="watchlist-alert-banner__list">
          {alerts.slice(1).map((a) => (
            <li key={a.watchlist.id} className="watchlist-alert-banner__list-item">
              {alertMessage(a)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default WatchlistAlertBanner;
