// SPDX-License-Identifier: BUSL-1.1

/**
 * ConnectionHealthCard — Displays health status for a single bank connection.
 *
 * Shows connection name, provider, health status badge, last sync time,
 * staleness indicator, and action buttons for re-auth / disconnect.
 *
 * @module components/bank/ConnectionHealthCard
 * References: #1577
 */

import React from 'react';
import { AppIcon } from '../icons';

import type { BankConnectionHealth } from '../../hooks/useBankConnections';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectionHealthCardProps {
  /** The bank connection health data. */
  connection: BankConnectionHealth;
  /** Callback when the user wants to view health history. */
  onViewHistory?: (connectionId: string) => void;
  /** Callback when the user wants to re-authenticate. */
  onReauth?: (connectionId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Human-readable labels for health statuses. */
const HEALTH_LABELS: Record<string, string> = {
  healthy: 'Healthy',
  stale: 'Stale',
  auth_expired: 'Auth Expired',
  provider_down: 'Provider Down',
  rate_limited: 'Rate Limited',
  institution_error: 'Bank Error',
  unknown_error: 'Error',
};

/** CSS class suffix for health status badges. */
const HEALTH_CLASSES: Record<string, string> = {
  healthy: 'health-badge--healthy',
  stale: 'health-badge--stale',
  auth_expired: 'health-badge--error',
  provider_down: 'health-badge--error',
  rate_limited: 'health-badge--warning',
  institution_error: 'health-badge--error',
  unknown_error: 'health-badge--error',
};

/**
 * Format staleness duration in a human-readable way.
 */
function formatStaleness(minutes: number | null): string {
  if (minutes === null) return 'Never synced';
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

/**
 * Format a timestamp for display.
 */
function formatTimestamp(iso: string | null): string {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return 'Unknown';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Card displaying health status for a single bank connection.
 *
 * Includes staleness indicator, error categorisation, and action buttons.
 */
export const ConnectionHealthCard: React.FC<ConnectionHealthCardProps> = ({
  connection,
  onViewHistory,
  onReauth,
}) => {
  const healthLabel = HEALTH_LABELS[connection.healthStatus] ?? 'Unknown';
  const healthClass = HEALTH_CLASSES[connection.healthStatus] ?? 'health-badge--unknown';

  return (
    <article
      className="connection-health-card"
      aria-label={`${connection.institutionName} connection health`}
    >
      <div className="connection-health-card__header">
        <div className="connection-health-card__info">
          <h3 className="connection-health-card__name">{connection.institutionName}</h3>
          <span className="connection-health-card__provider">{connection.provider}</span>
        </div>
        <span
          className={`health-badge ${healthClass}`}
          role="status"
          aria-label={`Health: ${healthLabel}`}
        >
          {healthLabel}
        </span>
      </div>

      <div className="connection-health-card__details">
        <div className="connection-health-card__detail">
          <span className="connection-health-card__label">Last sync</span>
          <span className="connection-health-card__value">
            {formatTimestamp(connection.lastSyncedAt)}
          </span>
        </div>

        <div className="connection-health-card__detail">
          <span className="connection-health-card__label">Freshness</span>
          <span className="connection-health-card__value" aria-live="polite">
            {formatStaleness(connection.stalenessMinutes)}
          </span>
        </div>

        <div className="connection-health-card__detail">
          <span className="connection-health-card__label">Access</span>
          <span className="connection-health-card__value">
            {connection.permissionLevel === 'read_only' ? (
              <>
                <AppIcon name="lock" /> Read-only
              </>
            ) : (
              connection.permissionLevel
            )}
          </span>
        </div>

        {connection.errorCategory && (
          <div className="connection-health-card__detail">
            <span className="connection-health-card__label">Issue</span>
            <span className="connection-health-card__value connection-health-card__value--error">
              {connection.errorCategory}: {connection.errorCode ?? 'Unknown'}
            </span>
          </div>
        )}
      </div>

      <div className="connection-health-card__actions">
        {onViewHistory && (
          <button
            type="button"
            className="connection-health-card__action"
            onClick={() => onViewHistory(connection.id)}
            aria-label={`View health history for ${connection.institutionName}`}
          >
            History
          </button>
        )}
        {connection.needsReauth && onReauth && (
          <button
            type="button"
            className="connection-health-card__action connection-health-card__action--primary"
            onClick={() => onReauth(connection.id)}
            aria-label={`Re-authenticate ${connection.institutionName}`}
          >
            Re-authenticate
          </button>
        )}
      </div>
    </article>
  );
};
