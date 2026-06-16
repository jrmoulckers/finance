// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  buildPoaAuditEvent,
  createPoaAccessGrant,
  evaluatePoaAccess,
  getPoaGrantStatus,
  revokePoaAccessGrant,
} from './poa-access';

const NOW = '2025-04-01T12:00:00Z';

function grant() {
  return createPoaAccessGrant({
    id: 'poa-1',
    householdId: 'household-1',
    caregiverMemberId: 'caregiver-1',
    scopes: ['BILLS', 'BALANCES', 'BILLS'],
    startsAt: '2025-01-01T00:00:00Z',
    expiresAt: '2025-12-31T23:59:59Z',
    createdAt: NOW,
  });
}

describe('createPoaAccessGrant', () => {
  it('deduplicates scopes and records legal-boundary copy', () => {
    const result = grant();

    expect(result.scopes).toEqual(['BILLS', 'BALANCES']);
    expect(result.authorizationNote).toContain('does not grant legal authority');
  });
});

describe('evaluatePoaAccess', () => {
  it('allows scoped read-only views', () => {
    const decision = evaluatePoaAccess(grant(), 'BILLS', 'VIEW', NOW);

    expect(decision.allowed).toBe(true);
    expect(decision.watermark).toBe('Read-only caregiver/POA view');
  });

  it('blocks edits and unapproved exports', () => {
    expect(evaluatePoaAccess(grant(), 'BILLS', 'EDIT', NOW).allowed).toBe(false);
    expect(evaluatePoaAccess(grant(), 'BILLS', 'EXPORT', NOW).reason).toContain(
      'unapproved exports',
    );
  });

  it('blocks views outside the selected scope', () => {
    expect(evaluatePoaAccess(grant(), 'NET_WORTH_SUMMARY', 'VIEW', NOW).allowed).toBe(false);
  });
});

describe('getPoaGrantStatus', () => {
  it('detects expired and revoked grants', () => {
    const activeGrant = grant();
    const revokedGrant = revokePoaAccessGrant(activeGrant, '2025-02-01T00:00:00Z');

    expect(getPoaGrantStatus(activeGrant, '2026-01-01T00:00:00Z')).toBe('EXPIRED');
    expect(getPoaGrantStatus(revokedGrant, NOW)).toBe('REVOKED');
  });
});

describe('buildPoaAuditEvent', () => {
  it('creates owner-readable audit summaries', () => {
    const event = buildPoaAuditEvent(grant(), 'ALERTS', 'VIEW', NOW);

    expect(event.summary).toBe('view alerts via POA-scoped access');
  });
});
