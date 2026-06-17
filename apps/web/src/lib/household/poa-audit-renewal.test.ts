// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { createPoaAccessGrant, revokePoaAccessGrant } from './poa-access';
import {
  buildPoaImmediateRevokeCopy,
  buildPoaOwnerAuditEntry,
  getPoaRenewalReminder,
  POA_LEGAL_BOUNDARY_ONBOARDING_COPY,
} from './poa-audit-renewal';

const grant = createPoaAccessGrant({
  id: 'grant-1',
  householdId: 'household-1',
  caregiverMemberId: 'caregiver-1',
  scopes: ['BILLS', 'BALANCES'],
  startsAt: '2025-01-01T00:00:00Z',
  expiresAt: '2025-05-20T00:00:00Z',
  createdAt: '2025-01-01T00:00:00Z',
});

describe('buildPoaOwnerAuditEntry', () => {
  it('records grant, caregiver, scope, action, timestamp, and owner-readable summary', () => {
    const entry = buildPoaOwnerAuditEntry(grant, 'BILLS', 'VIEW', '2025-05-01T00:00:00Z');

    expect(entry).toMatchObject({
      grantId: 'grant-1',
      caregiverMemberId: 'caregiver-1',
      scope: 'BILLS',
      action: 'VIEW',
      occurredAt: '2025-05-01T00:00:00Z',
      readOnlyLabel: 'Read-only caregiver/POA view',
    });
    expect(entry.ownerSummary).toBe('Caregiver caregiver-1 used view for bills.');
  });
});

describe('getPoaRenewalReminder', () => {
  it('flags active grants approaching expiration', () => {
    const reminder = getPoaRenewalReminder(grant, '2025-05-01T00:00:00Z');

    expect(reminder.due).toBe(true);
    expect(reminder.daysUntilExpiration).toBe(19);
    expect(reminder.message).toContain('renew this read-only caregiver access');
  });

  it('does not remind for revoked grants', () => {
    const reminder = getPoaRenewalReminder(revokePoaAccessGrant(grant, '2025-04-01T00:00:00Z'), '2025-05-01T00:00:00Z');

    expect(reminder.due).toBe(false);
    expect(reminder.daysUntilExpiration).toBeNull();
  });
});

describe('POA onboarding copy', () => {
  it('clarifies legal boundaries and immediate revoke behavior', () => {
    expect(POA_LEGAL_BOUNDARY_ONBOARDING_COPY).toContain('does not grant power of attorney');
    expect(buildPoaImmediateRevokeCopy('Avery')).toContain('Revoke Avery');
  });
});
