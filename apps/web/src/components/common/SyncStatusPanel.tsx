// SPDX-License-Identifier: BUSL-1.1

/**
 * Enhanced sync status panel with detailed information.
 *
 * Extends the compact SyncStatusBar with a collapsible detail panel
 * showing last sync time, pending mutation count, conflict summary,
 * and a manual sync trigger button.
 *
 * Accessibility:
 *   - Uses `aria-expanded` to indicate panel state
 *   - `aria-controls` links trigger to content
 *   - Panel content uses semantic headings and lists
 *   - All interactive elements are keyboard-accessible
 *
 * References: issue #627
 */

import React, { useCallback, useState } from 'react';
import { useSyncStatus } from '../../hooks/useSyncStatus';

import '../../styles/sync-status.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string | null): string {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0 || Number.isNaN(diffMs)) return '';
  if (diffMs < 60_000) return 'just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(diffMs / 86_400_000);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SyncStatusPanel: React.FC = () => {
  const {
    isOnline,
    isOffline,
    pendingMutations,
    lastSyncTime,
    isSyncing,
    syncNow,
    authError,
    conflictCount,
  } = useSyncStatus();

  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleSyncNow = useCallback(() => {
    syncNow();
  }, [syncNow]);

  const statusLabel = isSyncing
    ? 'Syncing…'
    : authError
      ? 'Authentication required'
      : isOffline
        ? 'Offline'
        : pendingMutations > 0
          ? `${pendingMutations} pending`
          : 'All synced';

  const statusVariant = isSyncing
    ? 'syncing'
    : authError
      ? 'error'
      : isOffline
        ? 'offline'
        : conflictCount > 0
          ? 'conflict'
          : pendingMutations > 0
            ? 'pending'
            : 'synced';

  return (
    <div className="sync-panel" role="region" aria-label="Sync status details">
      <button
        type="button"
        className={`sync-panel__header sync-status-bar--${statusVariant}`}
        aria-expanded={isExpanded}
        aria-controls="sync-panel-content"
        onClick={toggleExpanded}
      >
        <span className="sync-panel__indicator" aria-hidden="true">
          {statusVariant === 'synced'
            ? '✓'
            : statusVariant === 'syncing'
              ? '↻'
              : statusVariant === 'error'
                ? '⚠'
                : statusVariant === 'offline'
                  ? '☁'
                  : statusVariant === 'conflict'
                    ? '⬥'
                    : '◷'}
        </span>
        <span className="sync-panel__label">{statusLabel}</span>
        {lastSyncTime && !isExpanded && (
          <span className="sync-panel__relative-time">{formatRelativeTime(lastSyncTime)}</span>
        )}
        <span className="sync-panel__chevron" aria-hidden="true">
          {isExpanded ? '▲' : '▼'}
        </span>
      </button>

      {isExpanded && (
        <div
          id="sync-panel-content"
          className="sync-panel__content"
          role="group"
          aria-label="Sync details"
        >
          <dl className="sync-panel__details">
            <div className="sync-panel__detail-row">
              <dt>Status</dt>
              <dd>
                {isOnline ? (
                  <span className="sync-panel__badge sync-panel__badge--online">Online</span>
                ) : (
                  <span className="sync-panel__badge sync-panel__badge--offline">Offline</span>
                )}
              </dd>
            </div>
            <div className="sync-panel__detail-row">
              <dt>Last sync</dt>
              <dd>{formatTimestamp(lastSyncTime)}</dd>
            </div>
            <div className="sync-panel__detail-row">
              <dt>Pending changes</dt>
              <dd>{pendingMutations}</dd>
            </div>
            {conflictCount > 0 && (
              <div className="sync-panel__detail-row">
                <dt>Conflicts</dt>
                <dd className="sync-panel__conflict-count">
                  {conflictCount} need{conflictCount === 1 ? 's' : ''} resolution
                </dd>
              </div>
            )}
            {authError && (
              <div className="sync-panel__detail-row">
                <dt>Auth</dt>
                <dd className="sync-panel__auth-error">Re-authentication required</dd>
              </div>
            )}
          </dl>

          <div className="sync-panel__actions">
            <button
              type="button"
              className="sync-panel__sync-button"
              onClick={handleSyncNow}
              disabled={isSyncing || isOffline}
              aria-label={isSyncing ? 'Sync in progress' : 'Sync now'}
            >
              {isSyncing ? 'Syncing…' : 'Sync Now'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SyncStatusPanel;
