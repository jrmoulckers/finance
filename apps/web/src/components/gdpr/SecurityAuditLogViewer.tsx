// SPDX-License-Identifier: BUSL-1.1

import React, { useEffect, useMemo, useState } from 'react';
import {
  loadSecurityAuditLog,
  verifySecurityAuditLogIntegrity,
  type AuditActionType,
  type SecurityAuditEvent,
} from '../../lib/security-audit-log';
import './privacy-settings.css';

const ACTION_LABELS: Record<AuditActionType, string> = {
  data_export_generated: 'Data export generated',
  account_deletion_attempted: 'Account deletion attempted',
  account_deletion_completed: 'Account deletion completed',
  consent_changed: 'Consent changed',
  passkey_registered: 'Passkey registered',
  passkey_removed: 'Passkey removed',
  session_timeout: 'Idle session timeout',
  app_lock_enabled: 'App lock enabled',
  app_locked: 'App locked',
  app_unlocked: 'App unlocked',
  app_lock_bypassed: 'App lock bypassed',
  step_up_reauth: 'Step-up re-authentication',
  third_party_permission_granted: 'Third-party permission granted',
  third_party_permission_revoked: 'Third-party permission revoked',
  third_party_education_acknowledged: 'Third-party safety education acknowledged',
  privacy_mode_toggled: 'Privacy mode toggled',
};

export const SecurityAuditLogViewer: React.FC = () => {
  const [events, setEvents] = useState<SecurityAuditEvent[]>(() =>
    loadSecurityAuditLog().slice().reverse(),
  );
  const [filter, setFilter] = useState<AuditActionType | 'all'>('all');
  const [integrityFailure, setIntegrityFailure] = useState(false);

  useEffect(() => {
    let active = true;
    void verifySecurityAuditLogIntegrity().then((result) => {
      if (active) setIntegrityFailure(!result.ok);
    });
    const refresh = () => setEvents(loadSecurityAuditLog().slice().reverse());
    window.addEventListener('storage', refresh);
    return () => {
      active = false;
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const shown = useMemo(
    () => (filter === 'all' ? events : events.filter((event) => event.action === filter)),
    [events, filter],
  );

  return (
    <section className="consent-history" aria-label="Sensitive action audit log">
      <div className="consent-history__header">
        <h3 className="consent-history__title">Sensitive action audit log</h3>
        <label className="privacy-settings__category-description">
          Filter{' '}
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as AuditActionType | 'all')}
          >
            <option value="all">All actions</option>
            {Object.entries(ACTION_LABELS).map(([action, label]) => (
              <option key={action} value={action}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="privacy-settings__category-description">
        Each event is chained to the previous event hash so edits or removals can be detected
        locally.
      </p>
      {integrityFailure && (
        <p role="alert">
          Audit log integrity check failed. Some entries may have been changed outside Finance.
        </p>
      )}
      {shown.length === 0 ? (
        <p className="consent-history__empty">No sensitive actions recorded yet.</p>
      ) : (
        <ol
          className="consent-history__timeline"
          role="list"
          aria-label="Sensitive action timeline"
        >
          {shown.map((event) => (
            <li key={event.id} className="consent-history__event" role="listitem">
              <div className="consent-history__event-content">
                <div className="consent-history__event-header">
                  <span className="consent-history__event-category">
                    {ACTION_LABELS[event.action]}
                  </span>
                  <span className="consent-history__event-badge">{event.result}</span>
                </div>
                <div className="consent-history__event-meta">
                  <time dateTime={event.timestamp}>
                    {new Date(event.timestamp).toLocaleString()}
                  </time>
                  <span>session {event.sessionId.slice(0, 8)}</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};

export default SecurityAuditLogViewer;
