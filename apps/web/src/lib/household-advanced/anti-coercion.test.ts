// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import {
  deriveTrend,
  deriveHealthStatus,
  computePercentage,
  buildMaskedView,
  buildMaskedViews,
  detectRapidChanges,
  flagAsSuspicious,
  createDefaultSafeguard,
  activateSafeMode,
  deactivateSafeMode,
  enableIndependentAccess,
  createPermissionChangeEntry,
  getEntriesForUser,
  getSuspiciousEntries,
} from './anti-coercion';
import type {
  CoercionSafeguard as _CoercionSafeguard,
  PermissionChangeEntry as PCE,
} from './types';

const NOW = '2025-01-15T10:00:00.000Z';

describe('anti-coercion', () => {
  describe('deriveTrend', () => {
    it('returns up when current > previous', () => {
      expect(deriveTrend(15000, 10000)).toBe('up');
    });
    it('returns down when current < previous', () => {
      expect(deriveTrend(5000, 10000)).toBe('down');
    });
    it('returns stable when equal', () => {
      expect(deriveTrend(10000, 10000)).toBe('stable');
    });
  });

  describe('deriveHealthStatus', () => {
    it('returns healthy when >= 80% of target', () => {
      expect(deriveHealthStatus(8000, 10000)).toBe('healthy');
      expect(deriveHealthStatus(10000, 10000)).toBe('healthy');
    });
    it('returns caution when 50-79%', () => {
      expect(deriveHealthStatus(5000, 10000)).toBe('caution');
      expect(deriveHealthStatus(7999, 10000)).toBe('caution');
    });
    it('returns at_risk when < 50%', () => {
      expect(deriveHealthStatus(4999, 10000)).toBe('at_risk');
    });
    it('returns healthy when target is 0 (divide-by-zero guard)', () => {
      expect(deriveHealthStatus(5000, 0)).toBe('healthy');
    });
    it('returns healthy when target is negative', () => {
      expect(deriveHealthStatus(5000, -100)).toBe('healthy');
    });
  });

  describe('computePercentage', () => {
    it('computes correct percentage', () => {
      expect(computePercentage(2500, 10000)).toBe(25);
    });
    it('returns 0 when total is 0 (divide-by-zero guard)', () => {
      expect(computePercentage(5000, 0)).toBe(0);
    });
    it('uses banker rounding on .5 boundaries', () => {
      // 1/3 * 100 = 33.333... -> 33.33
      expect(computePercentage(1, 3)).toBeCloseTo(33.33, 1);
    });
  });

  describe('buildMaskedView', () => {
    it('builds a masked view with no raw amounts', () => {
      const mv = buildMaskedView('Savings', 8000, 7000, 20000, 10000);
      expect(mv.label).toBe('Savings');
      expect(mv.percentage).toBe(40);
      expect(mv.trend).toBe('up');
      expect(mv.status).toBe('healthy');
      // Verify no raw cents anywhere
      expect(JSON.stringify(mv)).not.toContain('8000');
      expect(JSON.stringify(mv)).not.toContain('7000');
    });
  });

  describe('buildMaskedViews', () => {
    it('builds multiple masked views', () => {
      const views = buildMaskedViews(
        [
          { label: 'A', currentCents: 5000, previousCents: 4000, targetCents: 5000 },
          { label: 'B', currentCents: 5000, previousCents: 6000, targetCents: 10000 },
        ],
        10000,
      );
      expect(views).toHaveLength(2);
      expect(views[0].label).toBe('A');
      expect(views[1].trend).toBe('down');
    });
  });

  describe('detectRapidChanges', () => {
    it('returns true when changes exceed threshold in window', () => {
      const safeguard = createDefaultSafeguard('hh1');
      const entries: PCE[] = Array.from({ length: 5 }, (_, i) => ({
        id: `e${i}`,
        householdId: 'hh1',
        changedBy: 'u1',
        targetUser: 'u2',
        changeType: 'role_change',
        previousValue: 'viewer',
        newValue: 'editor',
        timestamp: NOW,
        flaggedAsSuspicious: false,
      }));
      expect(detectRapidChanges(entries, safeguard, NOW)).toBe(true);
    });

    it('returns false when changes are below threshold', () => {
      const safeguard = createDefaultSafeguard('hh1');
      const entries: PCE[] = [
        {
          id: 'e1',
          householdId: 'hh1',
          changedBy: 'u1',
          targetUser: 'u2',
          changeType: 'role_change',
          previousValue: 'viewer',
          newValue: 'editor',
          timestamp: NOW,
          flaggedAsSuspicious: false,
        },
      ];
      expect(detectRapidChanges(entries, safeguard, NOW)).toBe(false);
    });
  });

  describe('flagAsSuspicious', () => {
    it('sets flaggedAsSuspicious to true', () => {
      const entry = createPermissionChangeEntry(
        'e1',
        'hh1',
        'u1',
        'u2',
        'role_change',
        'viewer',
        'editor',
        NOW,
      );
      expect(entry.flaggedAsSuspicious).toBe(false);
      const flagged = flagAsSuspicious(entry);
      expect(flagged.flaggedAsSuspicious).toBe(true);
    });
  });

  describe('safe mode', () => {
    it('activates and deactivates', () => {
      const s = createDefaultSafeguard('hh1');
      expect(s.safeModeActive).toBe(false);
      const s2 = activateSafeMode(s);
      expect(s2.safeModeActive).toBe(true);
      const s3 = deactivateSafeMode(s2);
      expect(s3.safeModeActive).toBe(false);
    });

    it('enables independent access', () => {
      const s = createDefaultSafeguard('hh1');
      expect(s.independentAccessEnabled).toBe(false);
      const s2 = enableIndependentAccess(s);
      expect(s2.independentAccessEnabled).toBe(true);
    });
  });

  describe('audit trail', () => {
    it('creates an entry with correct fields', () => {
      const e = createPermissionChangeEntry(
        'id1',
        'hh1',
        'u1',
        'u2',
        'role_change',
        'viewer',
        'admin',
        NOW,
      );
      expect(e.id).toBe('id1');
      expect(e.changedBy).toBe('u1');
      expect(e.flaggedAsSuspicious).toBe(false);
    });

    it('filters entries for a user', () => {
      const entries: PCE[] = [
        createPermissionChangeEntry('1', 'hh1', 'u1', 'u2', 't', 'a', 'b', NOW),
        createPermissionChangeEntry('2', 'hh1', 'u3', 'u4', 't', 'a', 'b', NOW),
        createPermissionChangeEntry('3', 'hh1', 'u2', 'u5', 't', 'a', 'b', NOW),
      ];
      const forU2 = getEntriesForUser(entries, 'u2');
      expect(forU2).toHaveLength(2);
    });

    it('filters suspicious entries', () => {
      const e1 = createPermissionChangeEntry('1', 'hh1', 'u1', 'u2', 't', 'a', 'b', NOW);
      const e2 = flagAsSuspicious(
        createPermissionChangeEntry('2', 'hh1', 'u1', 'u2', 't', 'a', 'b', NOW),
      );
      expect(getSuspiciousEntries([e1, e2])).toHaveLength(1);
    });
  });
});
