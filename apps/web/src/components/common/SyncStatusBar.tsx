// SPDX-License-Identifier: BUSL-1.1

/**
 * Sync status indicator component.
 *
 * Shows the current synchronisation state in a compact bar:
 *   - Online / synced:  "All synced" with last-sync time
 *   - Pending:          "3 pending changes" with sync button
 *   - Syncing:          "Syncing…" with spinner
 *   - Error:            "Sync failed — Retry" with retry button
 *   - Offline:          "Offline — changes saved locally"
 *   - Conflicts:        "2 conflicts need attention" with link
 *
 * Accessibility:
 *   - `role="status"` + `aria-live="polite"` for screen reader announcements
 *   - All interactive elements are keyboard-accessible
 *   - Decorative icons are hidden with `aria-hidden="true"`
 *   - Action buttons have explicit `aria-label` attributes
 *
 * References: issue #416
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useSyncStatus } from '../../hooks/useSyncStatus';
import { getUnresolvedConflicts } from '../../db/sync/sync-conflict';

import '../../styles/sync-status.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format an ISO-8601 timestamp as a human-readable relative time string.
 */
function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return '';

  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 0 || Number.isNaN(diffMs)) return '';
  if (diffMs < 60_000) return 'just now';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    return `${minutes} min${minutes !== 1 ? 's' : ''} ago`;
  }

  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) {
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  }

  const days = Math.floor(diffMs / 86_400_000);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

// ---------------------------------------------------------------------------
// Sync variant
// ---------------------------------------------------------------------------

type SyncVariant = 'synced' | 'pending' | 'syncing' | 'error' | 'offline' | 'conflict';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Compact sync status indicator for the app layout.
 *
 * Renders a thin bar showing the current sync state with appropriate
 * semantic colours and screen reader announcements.
 */
export const SyncStatusBar: React.FC = () => {
  const { isOnline, isOffline, pendingMutations, lastSyncTime, isSyncing, syncNow } =
    useSyncStatus();

  const [conflictCount, setConflictCount] = useState(0);
  const [lastSyncFailed, setLastSyncFailed] = useState(false);

  // Track the previous syncing state to detect sync failures.
  const prevSyncingRef = useRef(false);

  useEffect(() => {
    if (prevSyncingRef.current && !isSyncing && pendingMutations > 0 && isOnline) {
      // Sync just finished but mutations remain → sync failed.
      setLastSyncFailed(true);
    } else if (isSyncing) {
      setLastSyncFailed(false);
    }
    prevSyncingRef.current = isSyncing;
  }, [isSyncing, pendingMutations, isOnline]);

  // Poll unresolved conflicts whenever sync state changes.
  useEffect(() => {
    let cancelled = false;

    async function checkConflicts(): Promise<void> {
      try {
        const conflicts = await getUnresolvedConflicts();
        if (!cancelled) {
          setConflictCount(conflicts.length);
        }
      } catch {
        // IndexedDB may not be available in some contexts.
      }
    }

    void checkConflicts();
    return () => {
      cancelled = true;
    };
  }, [isSyncing, pendingMutations]);

  // Determine the visual variant.
  let variant: SyncVariant;
  if (isOffline) {
    variant = 'offline';
  } else if (isSyncing) {
    variant = 'syncing';
  } else if (conflictCount > 0) {
    variant = 'conflict';
  } else if (lastSyncFailed) {
    variant = 'error';
  } else if (pendingMutations > 0) {
    variant = 'pending';
  } else {
    variant = 'synced';
  }

  const handleRetry = useCallback(() => {
    setLastSyncFailed(false);
    syncNow();
  }, [syncNow]);

  const relativeTime = formatRelativeTime(lastSyncTime);

  return (
    <div
      className={`sync-status-bar sync-status-bar--${variant}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <SyncIcon variant={variant} />
      <span className="sync-status-bar__text">
        {renderStatusText(variant, pendingMutations, conflictCount)}
      </span>
      {relativeTime && variant === 'synced' && (
        <span className="sync-status-bar__time" aria-label={`Last synced ${relativeTime}`}>
          {relativeTime}
        </span>
      )}
      {variant === 'pending' && (
        <button
          type="button"
          className="sync-status-bar__action"
          onClick={handleRetry}
          aria-label="Sync pending changes now"
        >
          Sync now
        </button>
      )}
      {variant === 'error' && (
        <button
          type="button"
          className="sync-status-bar__action"
          onClick={handleRetry}
          aria-label="Retry failed sync"
        >
          Retry
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Status text
// ---------------------------------------------------------------------------

function renderStatusText(
  variant: SyncVariant,
  pendingMutations: number,
  conflictCount: number,
): string {
  switch (variant) {
    case 'synced':
      return 'All synced';
    case 'pending':
      return `${pendingMutations} pending change${pendingMutations !== 1 ? 's' : ''}`;
    case 'syncing':
      return 'Syncing\u2026';
    case 'error':
      return 'Sync failed';
    case 'offline':
      return 'Offline \u2014 changes saved locally';
    case 'conflict':
      return `${conflictCount} conflict${conflictCount !== 1 ? 's' : ''} need attention`;
  }
}

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

interface SyncIconProps {
  variant: SyncVariant;
}

const SyncIcon: React.FC<SyncIconProps> = ({ variant }) => {
  const iconClass =
    variant === 'syncing'
      ? 'sync-status-bar__icon sync-status-bar__spinner'
      : 'sync-status-bar__icon';

  // All icons are 16×16 SVGs hidden from assistive technology.
  const common = {
    className: iconClass,
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    'aria-hidden': true as const,
    focusable: false as const,
    xmlns: 'http://www.w3.org/2000/svg',
  };

  switch (variant) {
    case 'synced':
      // Checkmark circle
      return (
        <svg {...common} aria-label="Synced">
          <path
            d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case 'pending':
      // Clock / timer
      return (
        <svg {...common} aria-label="Pending changes">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path
            d="M12 7v5l3 3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case 'syncing':
      // Rotating arrows
      return (
        <svg {...common} aria-label="Syncing">
          <path
            d="M4 12a8 8 0 0114.93-4M20 12a8 8 0 01-14.93 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M20 4v4h-4M4 20v-4h4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case 'error':
      // Exclamation triangle
      return (
        <svg {...common} aria-label="Sync error">
          <path
            d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case 'offline':
      // Cloud with slash
      return (
        <svg {...common} aria-label="Offline">
          <path
            d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
          <line
            x1="2"
            y1="2"
            x2="22"
            y2="22"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );

    case 'conflict':
      // Warning diamond
      return (
        <svg {...common} aria-label="Conflicts detected">
          <path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <rect
            x="4.93"
            y="4.93"
            width="14.14"
            height="14.14"
            rx="2"
            transform="rotate(45 12 12)"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
        </svg>
      );
  }
};

export default SyncStatusBar;
