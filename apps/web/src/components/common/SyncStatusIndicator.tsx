// SPDX-License-Identifier: BUSL-1.1

/**
 * SyncStatusIndicator — displays real-time sync state in the UI.
 *
 * Shows:
 *   - Connection status dot (green/yellow/red)
 *   - Pending changes badge
 *   - Last sync time
 *   - Conflict warnings
 *
 * Accessible: uses ARIA live regions to announce status changes.
 *
 * References: issue #443
 */

import React from 'react';
import { usePowerSyncStatus } from '../../hooks/usePowerSyncStatus';
import type { PowerSyncConnectionStatus } from '../../db/sync/powersync-client';
import './sync-status-indicator.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<PowerSyncConnectionStatus, string> = {
  disconnected: 'Offline',
  connecting: 'Connecting…',
  connected: 'Synced',
  syncing: 'Syncing…',
  error: 'Sync error',
};

const STATUS_COLORS: Record<PowerSyncConnectionStatus, string> = {
  disconnected: 'var(--semantic-status-negative)',
  connecting: 'var(--semantic-status-warning)',
  connected: 'var(--semantic-status-positive)',
  syncing: 'var(--semantic-status-info)',
  error: 'var(--semantic-status-negative)',
};

function formatLastSync(timestamp: string | null): string {
  if (!timestamp) return 'Never synced';
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60_000);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  } catch {
    return 'Unknown';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface SyncStatusIndicatorProps {
  /** Additional CSS class name. */
  className?: string;
  /** Whether to show the detailed view (pending counts, last sync time). */
  detailed?: boolean;
}

export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
  className = '',
  detailed = false,
}) => {
  const { enabled, status, pendingCount, conflicts } = usePowerSyncStatus();

  if (!enabled) {
    return null;
  }

  const statusLabel = STATUS_LABELS[status.connectionStatus];
  const statusColor = STATUS_COLORS[status.connectionStatus];
  const hasConflicts = conflicts.length > 0;
  const isSyncing = status.connectionStatus === 'syncing';

  return (
    <div
      className={`sync-status-indicator ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label={`Sync status: ${statusLabel}`}
    >
      {/* Status dot */}
      <span
        aria-hidden="true"
        className={`sync-status-indicator__dot${isSyncing ? ' sync-status-indicator__dot--syncing' : ''}`}
        style={{ backgroundColor: statusColor }}
      />

      {/* Status text */}
      <span>{statusLabel}</span>

      {/* Pending count badge */}
      {pendingCount > 0 && (
        <span
          aria-label={`${pendingCount} pending changes`}
          className="sync-status-indicator__badge"
        >
          {pendingCount}
        </span>
      )}

      {/* Conflict warning */}
      {hasConflicts && (
        <span
          aria-label={`${conflicts.length} sync conflict${conflicts.length > 1 ? 's' : ''}`}
          className="sync-status-indicator__conflict"
        >
          ⚠
        </span>
      )}

      {/* Detailed info */}
      {detailed && (
        <span className="sync-status-indicator__detail">{formatLastSync(status.lastSyncTime)}</span>
      )}
    </div>
  );
};

export default SyncStatusIndicator;
