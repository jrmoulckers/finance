// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach } from 'vitest';
import {
  addConnection,
  getActiveConnections,
  getConnectionsByType,
  getScopesSummary,
  loadConnections,
  recordConnectionAccess,
  revokeConnection,
  updateConnectionStatus,
} from './connection-transparency';

describe('connection-transparency', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('addConnection', () => {
    it('creates a new active connection', () => {
      const conn = addConnection('Plaid', 'aggregator', ['read:accounts', 'read:transactions']);
      expect(conn.id).toBeTruthy();
      expect(conn.providerName).toBe('Plaid');
      expect(conn.providerType).toBe('aggregator');
      expect(conn.status).toBe('active');
      expect(conn.scopes).toEqual(['read:accounts', 'read:transactions']);
      expect(conn.lastAccessedAt).toBeNull();
    });

    it('persists the connection', () => {
      addConnection('Plaid', 'aggregator', ['read:accounts']);
      const loaded = loadConnections();
      expect(loaded).toHaveLength(1);
    });
  });

  describe('updateConnectionStatus', () => {
    it('updates status to paused', () => {
      const conn = addConnection('Plaid', 'aggregator', ['read:accounts']);
      const updated = updateConnectionStatus(conn.id, 'paused');
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('paused');
    });

    it('returns null for non-existent connection', () => {
      expect(updateConnectionStatus('non-existent', 'paused')).toBeNull();
    });
  });

  describe('revokeConnection', () => {
    it('sets status to revoked', () => {
      const conn = addConnection('Plaid', 'aggregator', ['read:accounts']);
      const revoked = revokeConnection(conn.id);
      expect(revoked).not.toBeNull();
      expect(revoked!.status).toBe('revoked');
    });
  });

  describe('recordConnectionAccess', () => {
    it('updates lastAccessedAt', () => {
      const conn = addConnection('Plaid', 'aggregator', ['read:accounts']);
      expect(conn.lastAccessedAt).toBeNull();

      const accessed = recordConnectionAccess(conn.id);
      expect(accessed).not.toBeNull();
      expect(accessed!.lastAccessedAt).toBeTruthy();
    });

    it('returns null for non-existent connection', () => {
      expect(recordConnectionAccess('non-existent')).toBeNull();
    });
  });

  describe('getActiveConnections', () => {
    it('excludes revoked connections', () => {
      const conn1 = addConnection('Plaid', 'aggregator', ['read:accounts']);
      addConnection('Yodlee', 'aggregator', ['read:accounts']);
      revokeConnection(conn1.id);

      const active = getActiveConnections();
      expect(active).toHaveLength(1);
      expect(active[0].providerName).toBe('Yodlee');
    });

    it('excludes expired connections', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      addConnection('ExpiredProvider', 'sync', ['read:data'], pastDate.toISOString());

      const active = getActiveConnections();
      expect(active).toHaveLength(0);
    });
  });

  describe('getConnectionsByType', () => {
    it('filters by provider type', () => {
      addConnection('Plaid', 'aggregator', ['read:accounts']);
      addConnection('SyncService', 'sync', ['sync:data']);
      addConnection('ExportTool', 'export', ['export:data']);

      expect(getConnectionsByType('aggregator')).toHaveLength(1);
      expect(getConnectionsByType('sync')).toHaveLength(1);
      expect(getConnectionsByType('analytics')).toHaveLength(0);
    });
  });

  describe('getScopesSummary', () => {
    it('returns scopes for active connections', () => {
      addConnection('Plaid', 'aggregator', ['read:accounts', 'read:transactions']);
      addConnection('SyncService', 'sync', ['sync:data']);

      const summary = getScopesSummary();
      expect(summary.get('Plaid')).toEqual(['read:accounts', 'read:transactions']);
      expect(summary.get('SyncService')).toEqual(['sync:data']);
    });
  });
});
