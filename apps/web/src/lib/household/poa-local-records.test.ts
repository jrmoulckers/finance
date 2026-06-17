// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { buildPoaAuditEvent, createPoaAccessGrant } from './poa-access';
import {
  appendPoaAuditEvent,
  createPoaLocalAccessSnapshot,
  revokePoaGrantInSnapshot,
  upsertPoaGrant,
} from './poa-local-records';

const grant = createPoaAccessGrant({
  id: 'grant-1',
  householdId: 'household-1',
  caregiverMemberId: 'caregiver-1',
  scopes: ['BILLS'],
  startsAt: '2025-01-01T00:00:00Z',
  createdAt: '2025-01-01T00:00:00Z',
});

describe('poa local records', () => {
  it('upserts grants and preserves the read-only watermark for caregiver UX', () => {
    const snapshot = upsertPoaGrant(createPoaLocalAccessSnapshot('household-1'), grant);
    const updatedGrant = { ...grant, allowSummaryExport: true };
    const updated = upsertPoaGrant(snapshot, updatedGrant);

    expect(updated.grants).toEqual([updatedGrant]);
    expect(updated.readOnlyWatermark).toBe('Read-only caregiver/POA view');
  });

  it('records audit events and local revoke state without needing sync', () => {
    const event = buildPoaAuditEvent(grant, 'BILLS', 'VIEW', '2025-05-01T00:00:00Z');
    const snapshot = appendPoaAuditEvent(upsertPoaGrant(createPoaLocalAccessSnapshot('household-1'), grant), event);
    const revoked = revokePoaGrantInSnapshot(snapshot, 'grant-1', '2025-05-02T00:00:00Z');

    expect(snapshot.auditEvents).toEqual([event]);
    expect(revoked.grants[0].revokedAt).toBe('2025-05-02T00:00:00Z');
  });
});
