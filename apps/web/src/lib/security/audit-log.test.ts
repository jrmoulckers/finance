// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach } from 'vitest';
import {
  appendAuditEntry,
  clearAuditLog,
  exportAuditLog,
  getEventTypeCounts,
  loadAuditLog,
  queryAuditLog,
} from './audit-log';

describe('audit-log', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('appendAuditEntry', () => {
    it('appends an entry to the log', () => {
      const entry = appendAuditEntry('login', 'User logged in');
      expect(entry.id).toBeTruthy();
      expect(entry.eventType).toBe('login');
      expect(entry.severity).toBe('info');
      expect(entry.description).toBe('User logged in');
    });

    it('sets correct severity for critical events', () => {
      const entry = appendAuditEntry('data_erasure', 'Record erased');
      expect(entry.severity).toBe('critical');
    });

    it('sets correct severity for warning events', () => {
      const entry = appendAuditEntry('permission_change', 'Permissions updated');
      expect(entry.severity).toBe('warning');
    });

    it('includes metadata', () => {
      const entry = appendAuditEntry('settings_changed', 'Theme changed', {
        setting: 'theme',
        value: 'dark',
      });
      expect(entry.metadata.setting).toBe('theme');
    });

    it('includes IP and user agent when provided', () => {
      const entry = appendAuditEntry(
        'login',
        'User logged in',
        {},
        {
          ipAddress: '10.0.0.1',
          userAgent: 'Test Agent',
        },
      );
      expect(entry.ipAddress).toBe('10.0.0.1');
      expect(entry.userAgent).toBe('Test Agent');
    });

    it('persists entries', () => {
      appendAuditEntry('login', 'Login 1');
      appendAuditEntry('logout', 'Logout 1');
      expect(loadAuditLog()).toHaveLength(2);
    });
  });

  describe('queryAuditLog', () => {
    beforeEach(() => {
      appendAuditEntry('login', 'Login event');
      appendAuditEntry('logout', 'Logout event');
      appendAuditEntry('data_erasure', 'Erasure event');
      appendAuditEntry('login', 'Login event 2');
    });

    it('returns all entries when no filter is applied (newest first)', () => {
      const results = queryAuditLog();
      expect(results).toHaveLength(4);
      // Newest first
      expect(results[0].description).toBe('Login event 2');
    });

    it('filters by event type', () => {
      const results = queryAuditLog({ eventTypes: ['login'] });
      expect(results).toHaveLength(2);
      expect(results.every((e) => e.eventType === 'login')).toBe(true);
    });

    it('filters by multiple event types', () => {
      const results = queryAuditLog({ eventTypes: ['login', 'logout'] });
      expect(results).toHaveLength(3);
    });

    it('filters by severity', () => {
      const results = queryAuditLog({ severity: 'critical' });
      expect(results).toHaveLength(1);
      expect(results[0].eventType).toBe('data_erasure');
    });

    it('limits results', () => {
      const results = queryAuditLog({ limit: 2 });
      expect(results).toHaveLength(2);
    });

    it('filters by date range', () => {
      const now = new Date().toISOString();
      const results = queryAuditLog({ endDate: now });
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('getEventTypeCounts', () => {
    it('counts events by type', () => {
      appendAuditEntry('login', 'Login 1');
      appendAuditEntry('login', 'Login 2');
      appendAuditEntry('logout', 'Logout 1');

      const counts = getEventTypeCounts();
      expect(counts.login).toBe(2);
      expect(counts.logout).toBe(1);
    });
  });

  describe('exportAuditLog', () => {
    it('exports the log as valid JSON', () => {
      appendAuditEntry('login', 'Login event');
      const exported = exportAuditLog();
      const parsed = JSON.parse(exported);
      expect(parsed.type).toBe('security_audit_log');
      expect(parsed.totalEntries).toBe(1);
      expect(parsed.entries).toHaveLength(1);
    });
  });

  describe('clearAuditLog', () => {
    it('clears all entries', () => {
      appendAuditEntry('login', 'Login event');
      clearAuditLog();
      expect(loadAuditLog()).toHaveLength(0);
    });
  });
});
