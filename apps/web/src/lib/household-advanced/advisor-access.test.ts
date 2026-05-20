// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import {
  grantAccess,
  revokeAccess,
  isAccessValid,
  isAccountVisible,
  isCategoryVisible,
  updateVisibleAccounts,
  updateVisibleCategories,
  renewAccess,
  createAccessLogEntry,
  getLogEntriesForAccess,
  getActiveGrants,
} from './advisor-access';

const GRANTED_AT = '2025-01-15T10:00:00.000Z';
const EXPIRES_AT = '2025-07-15T10:00:00.000Z';
const NOW_VALID = '2025-03-15T10:00:00.000Z';
const NOW_EXPIRED = '2025-08-15T10:00:00.000Z';

describe('advisor-access', () => {
  const makeGrant = () =>
    grantAccess(
      'aa1',
      'hh1',
      'advisor1',
      'advisor',
      ['acct1', 'acct2'],
      ['cat1', 'cat2'],
      'u1',
      GRANTED_AT,
      EXPIRES_AT,
    );

  describe('grantAccess', () => {
    it('creates a valid access record', () => {
      const a = makeGrant();
      expect(a.id).toBe('aa1');
      expect(a.role).toBe('advisor');
      expect(a.revokedAt).toBeNull();
      expect(a.visibleAccountIds).toEqual(['acct1', 'acct2']);
    });
  });

  describe('revokeAccess', () => {
    it('sets revokedAt', () => {
      const a = revokeAccess(makeGrant(), NOW_VALID);
      expect(a.revokedAt).toBe(NOW_VALID);
    });
  });

  describe('isAccessValid', () => {
    it('returns true when not revoked and not expired', () => {
      expect(isAccessValid(makeGrant(), NOW_VALID)).toBe(true);
    });

    it('returns false when expired', () => {
      expect(isAccessValid(makeGrant(), NOW_EXPIRED)).toBe(false);
    });

    it('returns false when revoked', () => {
      const revoked = revokeAccess(makeGrant(), NOW_VALID);
      expect(isAccessValid(revoked, NOW_VALID)).toBe(false);
    });
  });

  describe('visibility checks', () => {
    it('isAccountVisible checks the list', () => {
      const a = makeGrant();
      expect(isAccountVisible(a, 'acct1')).toBe(true);
      expect(isAccountVisible(a, 'acct3')).toBe(false);
    });

    it('isCategoryVisible checks the list', () => {
      const a = makeGrant();
      expect(isCategoryVisible(a, 'cat1')).toBe(true);
      expect(isCategoryVisible(a, 'cat3')).toBe(false);
    });
  });

  describe('scope updates', () => {
    it('updates visible accounts', () => {
      const a = updateVisibleAccounts(makeGrant(), ['acct3']);
      expect(a.visibleAccountIds).toEqual(['acct3']);
    });

    it('updates visible categories', () => {
      const a = updateVisibleCategories(makeGrant(), ['cat3', 'cat4']);
      expect(a.visibleCategoryIds).toEqual(['cat3', 'cat4']);
    });
  });

  describe('renewAccess', () => {
    it('extends expiry and clears revokedAt', () => {
      const revoked = revokeAccess(makeGrant(), NOW_VALID);
      const renewed = renewAccess(revoked, '2026-01-01T00:00:00.000Z');
      expect(renewed.expiresAt).toBe('2026-01-01T00:00:00.000Z');
      expect(renewed.revokedAt).toBeNull();
    });
  });

  describe('audit log', () => {
    it('creates a log entry', () => {
      const entry = createAccessLogEntry(
        'log1',
        'aa1',
        'granted',
        'u1',
        GRANTED_AT,
        'Initial grant',
      );
      expect(entry.action).toBe('granted');
      expect(entry.advisorAccessId).toBe('aa1');
    });

    it('filters entries by access ID', () => {
      const entries = [
        createAccessLogEntry('l1', 'aa1', 'granted', 'u1', GRANTED_AT, ''),
        createAccessLogEntry('l2', 'aa2', 'granted', 'u1', GRANTED_AT, ''),
        createAccessLogEntry('l3', 'aa1', 'accessed', 'advisor1', NOW_VALID, ''),
      ];
      expect(getLogEntriesForAccess(entries, 'aa1')).toHaveLength(2);
    });
  });

  describe('getActiveGrants', () => {
    it('returns only active grants for a household', () => {
      const g1 = makeGrant();
      const g2 = revokeAccess(
        grantAccess('aa2', 'hh1', 'advisor2', 'coach', [], [], 'u1', GRANTED_AT, EXPIRES_AT),
        NOW_VALID,
      );
      const g3 = grantAccess(
        'aa3',
        'hh2',
        'advisor3',
        'advisor',
        [],
        [],
        'u2',
        GRANTED_AT,
        EXPIRES_AT,
      );
      const active = getActiveGrants([g1, g2, g3], 'hh1', NOW_VALID);
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('aa1');
    });
  });
});
