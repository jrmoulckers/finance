// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it } from 'vitest';
import { markStepUpAuthenticated } from './session-security';
import {
  THIRD_PARTY_EDUCATION_KEY,
  acknowledgeThirdPartyEducation,
  hasAcknowledgedThirdPartyEducation,
  loadThirdPartyConnections,
  revokeThirdPartyConnection,
  saveThirdPartyConnections,
  summarizeThirdPartyPermissions,
  type ThirdPartyConnection,
} from './third-party-permissions';

const connection: ThirdPartyConnection = {
  id: 'google-oauth',
  displayName: 'Google',
  type: 'oauth',
  scopes: ['openid', 'email'],
  consentedAt: '2026-01-01T00:00:00.000Z',
  lastActivityAt: '2026-01-02T00:00:00.000Z',
  status: 'active',
  risk: 'medium',
  domain: 'accounts.google.com',
};

describe('third-party-permissions', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('flags stale active permissions for review', () => {
    saveThirdPartyConnections([connection]);

    expect(loadThirdPartyConnections(new Date('2026-05-01T00:00:00.000Z'))[0]).toMatchObject({
      status: 'needs_review',
    });
    expect(summarizeThirdPartyPermissions([connection], new Date('2026-05-01T00:00:00.000Z'))).toMatchObject({
      total: 1,
      stale: 1,
    });
  });

  it('requires step-up before revocation', async () => {
    saveThirdPartyConnections([connection]);

    await expect(revokeThirdPartyConnection(connection.id)).resolves.toMatchObject({ kind: 'step_up_required' });
    await markStepUpAuthenticated('third_party_permission_change');
    await expect(revokeThirdPartyConnection(connection.id)).resolves.toMatchObject({ kind: 'revoked' });
  });

  it('records education acknowledgement', async () => {
    await acknowledgeThirdPartyEducation(new Date('2026-05-26T12:00:00.000Z'));

    expect(hasAcknowledgedThirdPartyEducation()).toBe(true);
    expect(localStorage.getItem(THIRD_PARTY_EDUCATION_KEY)).toBe('2026-05-26T12:00:00.000Z');
  });
});
