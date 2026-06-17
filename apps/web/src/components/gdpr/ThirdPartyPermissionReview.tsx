// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  acknowledgeThirdPartyEducation,
  hasAcknowledgedThirdPartyEducation,
  loadThirdPartyConnections,
  revokeThirdPartyConnection,
  summarizeThirdPartyPermissions,
  type ThirdPartyConnection,
} from '../../lib/third-party-permissions';
import { markStepUpAuthenticated } from '../../lib/session-security';
import './privacy-settings.css';

export const ThirdPartyPermissionReview: React.FC = () => {
  const [connections, setConnections] = useState<ThirdPartyConnection[]>(() => loadThirdPartyConnections());
  const [educationAcknowledged, setEducationAcknowledged] = useState(() => hasAcknowledgedThirdPartyEducation());
  const [message, setMessage] = useState<string | null>(null);
  const summary = useMemo(() => summarizeThirdPartyPermissions(connections), [connections]);

  useEffect(() => {
    setConnections(loadThirdPartyConnections());
  }, []);

  const acknowledgeEducation = useCallback(async () => {
    await acknowledgeThirdPartyEducation();
    setEducationAcknowledged(true);
    setMessage('Safety guidance acknowledged.');
  }, []);

  const verifyIdentity = useCallback(async () => {
    await markStepUpAuthenticated('third_party_permission_change', { source: 'permission-review' });
    setMessage('Identity verified for third-party permission changes.');
  }, []);

  const revoke = useCallback(async (connection: ThirdPartyConnection) => {
    const result = await revokeThirdPartyConnection(connection.id);
    if (result.kind === 'step_up_required') {
      setMessage('Verify your identity before revoking a third-party connection.');
      return;
    }
    if (result.kind === 'not_found') {
      setMessage('Connection was not found.');
      return;
    }
    setConnections(loadThirdPartyConnections());
    setMessage(result.connection.displayName + ' disconnected.');
  }, []);

  return (
    <section aria-label="Third-party connections" className="page-section">
      <div className="settings-group">
        <h3 className="settings-group__title">Third-party connections</h3>
        <p className="privacy-settings__info">
          Review external access before sharing data. Check the domain, never share passwords or one-time codes, and disconnect stale or suspicious permissions.
        </p>
        <div className="settings-item settings-item--static">
          <span className="settings-item__label">Permission health</span>
          <span className="settings-item__value">
            {summary.active} active · {summary.stale} need review · {summary.risky} high risk
          </span>
        </div>
        {!educationAcknowledged && (
          <button type="button" className="settings-item settings-item--button" onClick={() => void acknowledgeEducation()}>
            <span className="settings-item__label">Acknowledge scam-resistant sharing guidance</span>
            <span className="settings-item__value">Review</span>
          </button>
        )}
        <button type="button" className="settings-item settings-item--button" onClick={() => void verifyIdentity()}>
          <span className="settings-item__label">Verify identity for permission changes</span>
          <span className="settings-item__value">Step-up</span>
        </button>
        {connections.length === 0 ? (
          <p className="privacy-settings__info">No third-party apps, banks, sync providers, or export recipients currently have saved access.</p>
        ) : (
          connections.map((connection) => (
            <div className="settings-item settings-item--static" key={connection.id}>
              <div>
                <span className="settings-item__label">{connection.displayName}</span>
                <p className="privacy-settings__category-description">
                  {connection.type} · {connection.scopes.join(', ') || 'No scopes recorded'} · status: {connection.status}
                  {connection.domain ? ' · ' + connection.domain : ''}
                </p>
              </div>
              <button
                type="button"
                className="settings-item__value"
                onClick={() => void revoke(connection)}
                disabled={connection.status === 'revoked'}
              >
                Revoke
              </button>
            </div>
          ))
        )}
        {message && (
          <div role="status" className="settings-item settings-item--static">
            <span className="settings-item__value">{message}</span>
          </div>
        )}
      </div>
    </section>
  );
};

export default ThirdPartyPermissionReview;
