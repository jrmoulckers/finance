// SPDX-License-Identifier: BUSL-1.1

import { revokePoaAccessGrant } from './poa-access';
import type { PoaAccessGrant, PoaAuditEvent } from './poa-access';

export interface PoaLocalAccessSnapshot {
  readonly householdId: string;
  readonly grants: readonly PoaAccessGrant[];
  readonly auditEvents: readonly PoaAuditEvent[];
  readonly readOnlyWatermark: string;
}

export function createPoaLocalAccessSnapshot(householdId: string): PoaLocalAccessSnapshot {
  return {
    householdId,
    grants: [],
    auditEvents: [],
    readOnlyWatermark: 'Read-only caregiver/POA view',
  };
}

export function upsertPoaGrant(
  snapshot: PoaLocalAccessSnapshot,
  grant: PoaAccessGrant,
): PoaLocalAccessSnapshot {
  return {
    ...snapshot,
    grants: [...snapshot.grants.filter((entry) => entry.id !== grant.id), grant],
  };
}

export function revokePoaGrantInSnapshot(
  snapshot: PoaLocalAccessSnapshot,
  grantId: string,
  revokedAt: string,
): PoaLocalAccessSnapshot {
  return {
    ...snapshot,
    grants: snapshot.grants.map((grant) =>
      grant.id === grantId ? revokePoaAccessGrant(grant, revokedAt) : grant,
    ),
  };
}

export function appendPoaAuditEvent(
  snapshot: PoaLocalAccessSnapshot,
  event: PoaAuditEvent,
): PoaLocalAccessSnapshot {
  return {
    ...snapshot,
    auditEvents: [...snapshot.auditEvents, event],
  };
}
