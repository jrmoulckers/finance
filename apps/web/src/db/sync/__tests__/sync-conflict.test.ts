// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the sync conflict storage module.
 *
 * Uses `fake-indexeddb` to provide an IndexedDB implementation in the
 * jsdom/Node test environment.
 *
 * References: issue #416
 */

import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearResolvedConflicts,
  CONFLICT_DB_NAME,
  getAllConflicts,
  getUnresolvedConflicts,
  resolveConflict,
  storeConflicts,
  type SyncConflict,
} from '../sync-conflict';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConflict(overrides: Partial<SyncConflict> = {}): SyncConflict {
  return {
    mutationId: crypto.randomUUID(),
    tableName: 'transaction',
    recordId: crypto.randomUUID(),
    clientData: { amount: 1500 },
    serverData: { amount: 2000 },
    resolvedAt: null,
    resolution: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sync-conflict', () => {
  afterEach(async () => {
    // Delete the database to avoid state leakage between tests.
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(CONFLICT_DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });

  // -----------------------------------------------------------------------
  // storeConflicts
  // -----------------------------------------------------------------------

  describe('storeConflicts', () => {
    it('should store conflicts in IndexedDB', async () => {
      const conflicts = [makeConflict(), makeConflict()];
      await storeConflicts(conflicts);

      const unresolved = await getUnresolvedConflicts();
      expect(unresolved).toHaveLength(2);
    });

    it('should handle an empty array gracefully', async () => {
      await storeConflicts([]);
      const unresolved = await getUnresolvedConflicts();
      expect(unresolved).toHaveLength(0);
    });

    it('should update an existing conflict on duplicate mutationId', async () => {
      const conflict = makeConflict({ clientData: { amount: 100 } });
      await storeConflicts([conflict]);

      const updated: SyncConflict = { ...conflict, clientData: { amount: 200 } };
      await storeConflicts([updated]);

      const unresolved = await getUnresolvedConflicts();
      expect(unresolved).toHaveLength(1);
      expect(unresolved[0].clientData).toEqual({ amount: 200 });
    });

    it('should preserve all conflict fields', async () => {
      const conflict = makeConflict({
        tableName: 'account',
        clientData: { name: 'Checking' },
        serverData: { name: 'Savings' },
      });
      await storeConflicts([conflict]);

      const stored = await getUnresolvedConflicts();
      expect(stored).toHaveLength(1);
      expect(stored[0].mutationId).toBe(conflict.mutationId);
      expect(stored[0].tableName).toBe('account');
      expect(stored[0].recordId).toBe(conflict.recordId);
      expect(stored[0].clientData).toEqual({ name: 'Checking' });
      expect(stored[0].serverData).toEqual({ name: 'Savings' });
      expect(stored[0].resolvedAt).toBeNull();
      expect(stored[0].resolution).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getUnresolvedConflicts
  // -----------------------------------------------------------------------

  describe('getUnresolvedConflicts', () => {
    it('should return only unresolved conflicts', async () => {
      const unresolved = makeConflict();
      const resolved = makeConflict({
        resolvedAt: Date.now(),
        resolution: 'server',
      });
      await storeConflicts([unresolved, resolved]);

      const result = await getUnresolvedConflicts();
      expect(result).toHaveLength(1);
      expect(result[0].mutationId).toBe(unresolved.mutationId);
    });

    it('should return an empty array when no conflicts exist', async () => {
      const result = await getUnresolvedConflicts();
      expect(result).toEqual([]);
    });

    it('should return an empty array when all conflicts are resolved', async () => {
      const c1 = makeConflict({ resolvedAt: Date.now(), resolution: 'client' });
      const c2 = makeConflict({ resolvedAt: Date.now(), resolution: 'server' });
      await storeConflicts([c1, c2]);

      const result = await getUnresolvedConflicts();
      expect(result).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // resolveConflict
  // -----------------------------------------------------------------------

  describe('resolveConflict', () => {
    it('should mark a conflict as resolved with client resolution', async () => {
      const conflict = makeConflict();
      await storeConflicts([conflict]);

      await resolveConflict(conflict.mutationId, 'client');

      const unresolved = await getUnresolvedConflicts();
      expect(unresolved).toHaveLength(0);
    });

    it('should mark a conflict as resolved with server resolution', async () => {
      const conflict = makeConflict();
      await storeConflicts([conflict]);

      await resolveConflict(conflict.mutationId, 'server');

      const unresolved = await getUnresolvedConflicts();
      expect(unresolved).toHaveLength(0);
    });

    it('should set resolvedAt timestamp and resolution field', async () => {
      const conflict = makeConflict();
      await storeConflicts([conflict]);

      const before = Date.now();
      await resolveConflict(conflict.mutationId, 'client');

      const all = await getAllConflicts();
      const resolved = all.find((c) => c.mutationId === conflict.mutationId);

      expect(resolved).toBeDefined();
      expect(resolved!.resolvedAt).toBeGreaterThanOrEqual(before);
      expect(resolved!.resolution).toBe('client');
    });

    it('should handle a non-existent conflict gracefully', async () => {
      // Should not throw.
      await resolveConflict('non-existent-id', 'server');

      const unresolved = await getUnresolvedConflicts();
      expect(unresolved).toHaveLength(0);
    });

    it('should only resolve the targeted conflict', async () => {
      const c1 = makeConflict();
      const c2 = makeConflict();
      await storeConflicts([c1, c2]);

      await resolveConflict(c1.mutationId, 'client');

      const unresolved = await getUnresolvedConflicts();
      expect(unresolved).toHaveLength(1);
      expect(unresolved[0].mutationId).toBe(c2.mutationId);
    });
  });

  // -----------------------------------------------------------------------
  // clearResolvedConflicts
  // -----------------------------------------------------------------------

  describe('clearResolvedConflicts', () => {
    it('should remove only resolved conflicts', async () => {
      const unresolved = makeConflict();
      const resolved = makeConflict({
        resolvedAt: Date.now(),
        resolution: 'client',
      });
      await storeConflicts([unresolved, resolved]);

      await clearResolvedConflicts();

      const remaining = await getAllConflicts();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].mutationId).toBe(unresolved.mutationId);
    });

    it('should handle an empty store gracefully', async () => {
      // Should not throw.
      await clearResolvedConflicts();

      const unresolved = await getUnresolvedConflicts();
      expect(unresolved).toHaveLength(0);
    });

    it('should remove all resolved conflicts when multiple exist', async () => {
      const r1 = makeConflict({ resolvedAt: Date.now(), resolution: 'client' });
      const r2 = makeConflict({ resolvedAt: Date.now(), resolution: 'server' });
      const u1 = makeConflict();
      await storeConflicts([r1, r2, u1]);

      await clearResolvedConflicts();

      const all = await getAllConflicts();
      expect(all).toHaveLength(1);
      expect(all[0].mutationId).toBe(u1.mutationId);
    });
  });

  // -----------------------------------------------------------------------
  // getAllConflicts
  // -----------------------------------------------------------------------

  describe('getAllConflicts', () => {
    it('should return all conflicts regardless of resolution status', async () => {
      const unresolved = makeConflict();
      const resolved = makeConflict({
        resolvedAt: Date.now(),
        resolution: 'server',
      });
      await storeConflicts([unresolved, resolved]);

      const all = await getAllConflicts();
      expect(all).toHaveLength(2);
    });

    it('should return an empty array when no conflicts exist', async () => {
      const all = await getAllConflicts();
      expect(all).toEqual([]);
    });
  });
});
