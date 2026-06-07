// SPDX-License-Identifier: BUSL-1.1

/**
 * SafetyCenter — Third-party connector permissions dashboard.
 *
 * Displays all third-party connectors that have access to the user's
 * financial data, their permission levels, and provides revocation controls.
 * Defaults to read-only for all connections.
 *
 * @module components/bank/SafetyCenter
 * References: #1583
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AppIcon, type IconName } from '../icons';

import type {
  ConnectorPermission,
  ConnectorAccessEntry,
} from '../../hooks/useConnectorPermissions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SafetyCenterProps {
  /** Connector permissions to display. */
  permissions: ConnectorPermission[];
  /** Access audit log entries. */
  accessLog: ConnectorAccessEntry[];
  /** Whether data is loading. */
  loading: boolean;
  /** Error message. */
  error: string | null;
  /** Callback to load the access log. */
  onLoadAccessLog?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Human-readable permission level labels. */
const PERMISSION_LABELS: Record<string, { icon: IconName; label: string }> = {
  read_only: { icon: 'lock', label: 'Read-only' },
  read_write: { icon: 'unlock', label: 'Read & Write' },
  read_balance: { icon: 'eye', label: 'Balance only' },
  read_transactions: { icon: 'clipboard', label: 'Transactions only' },
};

/** Human-readable access type labels. */
const ACCESS_TYPE_LABELS: Record<string, string> = {
  sync_transactions: 'Synced transactions',
  sync_balances: 'Synced balances',
  sync_accounts: 'Synced accounts',
  verify_identity: 'Verified identity',
  refresh_token: 'Refreshed access',
  revoke_access: 'Revoked access',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Safety center showing all third-party connector access.
 *
 * Displays permissions, scopes, token status, and provides
 * revocation controls. Shows an audit log of all data access events.
 */
export const SafetyCenter: React.FC<SafetyCenterProps> = ({
  permissions,
  accessLog,
  loading,
  error,
  onLoadAccessLog,
}) => {
  const [showAccessLog, setShowAccessLog] = useState(false);

  const handleToggleAccessLog = useCallback(() => {
    if (!showAccessLog && onLoadAccessLog) {
      onLoadAccessLog();
    }
    setShowAccessLog((prev) => !prev);
  }, [showAccessLog, onLoadAccessLog]);

  // Load access log on mount if toggled
  useEffect(() => {
    if (showAccessLog && onLoadAccessLog) {
      onLoadAccessLog();
    }
  }, [showAccessLog, onLoadAccessLog]);

  if (loading) {
    return (
      <div className="safety-center" role="status" aria-live="polite">
        <p>Loading connector permissions…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="safety-center" role="alert">
        <p className="safety-center__error">{error}</p>
      </div>
    );
  }

  const activePermissions = permissions.filter((p) => !p.isRevoked);
  const revokedPermissions = permissions.filter((p) => p.isRevoked);

  return (
    <section className="safety-center" aria-label="Third-party connector safety center">
      {/* Summary banner */}
      <div className="safety-center__summary" role="status" aria-live="polite">
        <h3 className="safety-center__title">
          <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 20 20">
            <path
              d="M10 1l7 3v5c0 4.4-3 8.5-7 9.5C6 17.5 3 13.4 3 9V4l7-3z"
              fill="currentColor"
              opacity="0.2"
            />
            <path
              d="M10 1l7 3v5c0 4.4-3 8.5-7 9.5C6 17.5 3 13.4 3 9V4l7-3z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
          Safety Center
        </h3>
        <p className="safety-center__subtitle">
          {activePermissions.length === 0
            ? 'No third-party connectors have access to your data.'
            : `${activePermissions.length} connector${activePermissions.length === 1 ? '' : 's'} with active access.`}
        </p>
        <p className="safety-center__note">
          All bank connections default to <strong>read-only</strong> access. Finance cannot move
          your money.
        </p>
      </div>

      {/* Active permissions */}
      {activePermissions.length > 0 && (
        <div className="safety-center__section">
          <h4 className="safety-center__section-title">Active Connectors</h4>
          <ul className="safety-center__list" role="list">
            {activePermissions.map((perm) => (
              <li key={perm.id} className="safety-center__item" role="listitem">
                <div className="safety-center__item-header">
                  <span className="safety-center__item-name">
                    {perm.connection?.institutionName ?? 'Unknown institution'}
                  </span>
                  <span className="safety-center__item-provider">
                    via {perm.connection?.provider ?? 'unknown'}
                  </span>
                </div>

                <div className="safety-center__item-details">
                  <span className="safety-center__permission-badge">
                    {PERMISSION_LABELS[perm.permissionLevel] ? (
                      <>
                        <AppIcon name={PERMISSION_LABELS[perm.permissionLevel].icon} />{' '}
                        {PERMISSION_LABELS[perm.permissionLevel].label}
                      </>
                    ) : (
                      perm.permissionLevel
                    )}
                  </span>

                  <span
                    className={`safety-center__token-status safety-center__token-status--${perm.tokenStatus}`}
                  >
                    Token: {perm.tokenStatus}
                  </span>
                </div>

                {perm.scopeDescriptions.length > 0 && (
                  <details className="safety-center__scopes">
                    <summary>View granted permissions ({perm.scopeDescriptions.length})</summary>
                    <ul role="list">
                      {perm.scopeDescriptions.map((desc, i) => (
                        <li key={i} role="listitem">
                          {desc}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Revoked permissions */}
      {revokedPermissions.length > 0 && (
        <details className="safety-center__section safety-center__section--revoked">
          <summary className="safety-center__section-title">
            Revoked Connectors ({revokedPermissions.length})
          </summary>
          <ul className="safety-center__list" role="list">
            {revokedPermissions.map((perm) => (
              <li
                key={perm.id}
                className="safety-center__item safety-center__item--revoked"
                role="listitem"
              >
                <span className="safety-center__item-name">
                  {perm.connection?.institutionName ?? 'Unknown'}
                </span>
                <span className="safety-center__revoked-date">
                  Revoked {perm.revokedAt ? new Date(perm.revokedAt).toLocaleDateString() : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Access audit log */}
      <div className="safety-center__section">
        <button
          type="button"
          className="safety-center__toggle"
          onClick={handleToggleAccessLog}
          aria-expanded={showAccessLog}
          aria-controls="access-log-section"
        >
          {showAccessLog ? 'Hide' : 'Show'} Data Access Log
        </button>

        {showAccessLog && (
          <div id="access-log-section" className="safety-center__access-log">
            {accessLog.length === 0 ? (
              <p className="safety-center__empty">No data access events recorded yet.</p>
            ) : (
              <table className="safety-center__log-table" aria-label="Data access audit log">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Action</th>
                    <th scope="col">Provider</th>
                    <th scope="col">Status</th>
                    <th scope="col">Records</th>
                  </tr>
                </thead>
                <tbody>
                  {accessLog.map((entry) => (
                    <tr key={entry.id}>
                      <td>{new Date(entry.createdAt).toLocaleString()}</td>
                      <td>{ACCESS_TYPE_LABELS[entry.accessType] ?? entry.accessType}</td>
                      <td>{entry.providerName}</td>
                      <td>
                        <span
                          className={`safety-center__status safety-center__status--${entry.status}`}
                        >
                          {entry.status}
                        </span>
                      </td>
                      <td>{entry.recordCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
