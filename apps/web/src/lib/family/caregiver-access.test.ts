// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for caregiver / guardian access engine.
 *
 * References: #1730
 */

import { describe, it, expect } from 'vitest';
import {
  createAccessGrant,
  createEmergencyAccess,
  revokeAccess,
  updatePermission,
  extendAccess,
  isAccessValid,
  canAccessAccount,
  hasWritePermission,
  createAuditEntry,
  getAuditEntriesForGrant,
  getAuditEntriesForAccount,
  getActiveGrantsForAccounts,
} from './caregiver-access';
import type { CaregiverAccess } from './types';

const NOW = '2025-01-15T12:00:00.000Z';

function makeGrant(overrides: Partial<CaregiverAccess> = {}): CaregiverAccess {
  return {
    id: 'grant-1',
    caregiverName: 'Grandma',
    caregiverContact: 'grandma@example.com',
    permission: 'read-only',
    accountIds: ['acc-1', 'acc-2'],
    validFrom: '2025-01-01T00:00:00.000Z',
    validUntil: '2025-12-31T23:59:59.000Z',
    isEmergency: false,
    active: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('caregiver-access', () => {
  describe('createAccessGrant', () => {
    it('creates a standard access grant', () => {
      const grant = createAccessGrant({
        id: 'g1',
        caregiverName: 'Grandma',
        caregiverContact: 'grandma@example.com',
        permission: 'read-only',
        accountIds: ['acc-1'],
        validFrom: NOW,
        validUntil: '2025-12-31T23:59:59.000Z',
        now: NOW,
      });
      expect(grant.active).toBe(true);
      expect(grant.isEmergency).toBe(false);
      expect(grant.permission).toBe('read-only');
    });
  });

  describe('createEmergencyAccess', () => {
    it('creates a time-limited emergency grant', () => {
      const grant = createEmergencyAccess({
        id: 'g-emg',
        caregiverName: 'Uncle Bob',
        caregiverContact: 'bob@example.com',
        accountIds: ['acc-1', 'acc-2'],
        validFrom: NOW,
        durationHours: 24,
        now: NOW,
      });
      expect(grant.isEmergency).toBe(true);
      expect(grant.permission).toBe('full');
      // Should expire 24h later
      const expires = new Date(grant.validUntil);
      const start = new Date(NOW);
      const diffHours = (expires.getTime() - start.getTime()) / 3600_000;
      expect(diffHours).toBe(24);
    });
  });

  describe('revokeAccess', () => {
    it('deactivates a grant', () => {
      const grant = makeGrant();
      expect(revokeAccess(grant).active).toBe(false);
    });
  });

  describe('updatePermission', () => {
    it('changes permission level', () => {
      const grant = makeGrant({ permission: 'read-only' });
      const updated = updatePermission(grant, 'limited-edit');
      expect(updated.permission).toBe('limited-edit');
    });
  });

  describe('extendAccess', () => {
    it('extends validity period', () => {
      const grant = makeGrant();
      const extended = extendAccess(grant, '2026-06-30T23:59:59.000Z');
      expect(extended.validUntil).toBe('2026-06-30T23:59:59.000Z');
    });
  });

  describe('isAccessValid', () => {
    it('returns true for active grant within validity window', () => {
      expect(isAccessValid(makeGrant(), NOW)).toBe(true);
    });

    it('returns false for inactive grant', () => {
      expect(isAccessValid(makeGrant({ active: false }), NOW)).toBe(false);
    });

    it('returns false when before validFrom', () => {
      expect(isAccessValid(makeGrant({ validFrom: '2025-02-01T00:00:00.000Z' }), NOW)).toBe(false);
    });

    it('returns false when after validUntil', () => {
      expect(isAccessValid(makeGrant({ validUntil: '2025-01-10T00:00:00.000Z' }), NOW)).toBe(false);
    });

    it('returns true for indefinite grants (empty validUntil)', () => {
      expect(isAccessValid(makeGrant({ validUntil: '' }), NOW)).toBe(true);
    });
  });

  describe('canAccessAccount', () => {
    it('returns true for accessible account', () => {
      expect(canAccessAccount(makeGrant(), 'acc-1', NOW)).toBe(true);
    });

    it('returns false for inaccessible account', () => {
      expect(canAccessAccount(makeGrant(), 'acc-3', NOW)).toBe(false);
    });

    it('returns false when grant is invalid', () => {
      expect(canAccessAccount(makeGrant({ active: false }), 'acc-1', NOW)).toBe(false);
    });
  });

  describe('hasWritePermission', () => {
    it('returns false for read-only', () => {
      expect(hasWritePermission(makeGrant({ permission: 'read-only' }))).toBe(false);
    });

    it('returns true for limited-edit', () => {
      expect(hasWritePermission(makeGrant({ permission: 'limited-edit' }))).toBe(true);
    });

    it('returns true for full', () => {
      expect(hasWritePermission(makeGrant({ permission: 'full' }))).toBe(true);
    });
  });

  describe('createAuditEntry', () => {
    it('creates an audit entry', () => {
      const entry = createAuditEntry({
        id: 'aud-1',
        accessId: 'grant-1',
        action: 'view-balance',
        accountId: 'acc-1',
        now: NOW,
        details: 'Viewed account balance',
      });
      expect(entry.action).toBe('view-balance');
      expect(entry.details).toBe('Viewed account balance');
    });

    it('defaults details to empty string', () => {
      const entry = createAuditEntry({
        id: 'aud-1',
        accessId: 'grant-1',
        action: 'view-balance',
        accountId: 'acc-1',
        now: NOW,
      });
      expect(entry.details).toBe('');
    });
  });

  describe('getAuditEntriesForGrant', () => {
    const entries = [
      createAuditEntry({ id: 'a1', accessId: 'g1', action: 'view', accountId: 'acc-1', now: NOW }),
      createAuditEntry({ id: 'a2', accessId: 'g2', action: 'view', accountId: 'acc-1', now: NOW }),
      createAuditEntry({ id: 'a3', accessId: 'g1', action: 'edit', accountId: 'acc-2', now: NOW }),
    ];

    it('filters by grant ID', () => {
      expect(getAuditEntriesForGrant(entries, 'g1')).toHaveLength(2);
    });
  });

  describe('getAuditEntriesForAccount', () => {
    const entries = [
      createAuditEntry({ id: 'a1', accessId: 'g1', action: 'view', accountId: 'acc-1', now: NOW }),
      createAuditEntry({ id: 'a2', accessId: 'g1', action: 'view', accountId: 'acc-2', now: NOW }),
    ];

    it('filters by account ID', () => {
      expect(getAuditEntriesForAccount(entries, 'acc-1')).toHaveLength(1);
    });
  });

  describe('getActiveGrantsForAccounts', () => {
    const grants = [
      makeGrant({ id: 'g1', accountIds: ['acc-1'] }),
      makeGrant({ id: 'g2', accountIds: ['acc-2', 'acc-3'] }),
      makeGrant({ id: 'g3', accountIds: ['acc-4'], active: false }),
    ];

    it('returns active grants for specified accounts', () => {
      const result = getActiveGrantsForAccounts(grants, ['acc-1', 'acc-3'], NOW);
      expect(result).toHaveLength(2);
    });

    it('excludes inactive grants', () => {
      const result = getActiveGrantsForAccounts(grants, ['acc-4'], NOW);
      expect(result).toHaveLength(0);
    });
  });
});
