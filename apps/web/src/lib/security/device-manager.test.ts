// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getActiveSessions,
  isSessionValid,
  loadSessions,
  maskIpAddress,
  parseDeviceName,
  registerSession,
  revokeAllOtherSessions,
  revokeSession,
  touchSession,
} from './device-manager';

describe('device-manager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('parseDeviceName', () => {
    it('detects iPhone', () => {
      expect(parseDeviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0)')).toBe('iPhone');
    });

    it('detects Windows', () => {
      expect(parseDeviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Windows PC');
    });

    it('detects Android', () => {
      expect(parseDeviceName('Mozilla/5.0 (Linux; Android 13)')).toBe('Android Device');
    });

    it('detects Mac', () => {
      expect(parseDeviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)')).toBe('Mac');
    });

    it('returns Unknown Device for empty string', () => {
      expect(parseDeviceName('')).toBe('Unknown Device');
    });
  });

  describe('maskIpAddress', () => {
    it('masks IPv4 last two octets', () => {
      expect(maskIpAddress('192.168.1.42')).toBe('192.168.x.x');
    });

    it('handles empty input', () => {
      expect(maskIpAddress('')).toBe('0.0.0.0');
    });
  });

  describe('session management', () => {
    it('registers a new session', () => {
      const session = registerSession('Mozilla/5.0 (Windows NT 10.0)', '10.0.0.1');
      expect(session.id).toBeTruthy();
      expect(session.deviceName).toBe('Windows PC');
      expect(session.isCurrent).toBe(true);
      expect(session.isRevoked).toBe(false);
      expect(session.ipAddress).toBe('10.0.x.x');
    });

    it('marks previous sessions as non-current on new registration', () => {
      registerSession('Mozilla/5.0 (Windows NT 10.0)', '10.0.0.1');
      registerSession('Mozilla/5.0 (iPhone)', '10.0.0.2');

      const sessions = loadSessions();
      const currentSessions = sessions.filter((s) => s.isCurrent);
      expect(currentSessions).toHaveLength(1);
      expect(currentSessions[0].deviceName).toBe('iPhone');
    });

    it('touches a session to update lastActiveAt', () => {
      const session = registerSession('Mozilla/5.0 (Windows NT 10.0)', '10.0.0.1');
      const original = session.lastActiveAt;

      // Small delay to ensure timestamp difference
      const updated = touchSession(session.id);
      expect(updated).not.toBeNull();
      expect(updated!.lastActiveAt).toBeTruthy();
      // The timestamp should be >= original
      expect(new Date(updated!.lastActiveAt).getTime()).toBeGreaterThanOrEqual(
        new Date(original).getTime(),
      );
    });

    it('returns null when touching a non-existent session', () => {
      expect(touchSession('non-existent')).toBeNull();
    });
  });

  describe('revocation', () => {
    it('revokes a session', () => {
      const session = registerSession('Mozilla/5.0 (Windows NT 10.0)', '10.0.0.1');
      const revoked = revokeSession(session.id);

      expect(revoked).not.toBeNull();
      expect(revoked!.isRevoked).toBe(true);
      expect(revoked!.isCurrent).toBe(false);
    });

    it('returns null when revoking a non-existent session', () => {
      expect(revokeSession('non-existent')).toBeNull();
    });

    it('revokes all other sessions', () => {
      registerSession('Mozilla/5.0 (Windows NT 10.0)', '10.0.0.1');
      registerSession('Mozilla/5.0 (iPhone)', '10.0.0.2');
      const current = registerSession('Mozilla/5.0 (Macintosh)', '10.0.0.3');

      const count = revokeAllOtherSessions();
      expect(count).toBe(2);

      const active = getActiveSessions();
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(current.id);
    });
  });

  describe('session validation', () => {
    it('validates an active session', () => {
      const session = registerSession('Mozilla/5.0 (Windows NT 10.0)', '10.0.0.1');
      expect(isSessionValid(session.id)).toBe(true);
    });

    it('invalidates a revoked session', () => {
      const session = registerSession('Mozilla/5.0 (Windows NT 10.0)', '10.0.0.1');
      revokeSession(session.id);
      expect(isSessionValid(session.id)).toBe(false);
    });

    it('returns false for non-existent session', () => {
      expect(isSessionValid('non-existent')).toBe(false);
    });
  });
});
