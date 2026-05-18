// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearDemoSession,
  demoLogin,
  demoRefreshToken,
  demoSignup,
  isDemoMode,
  persistDemoSession,
  restoreDemoSession,
} from './demo-auth';

// ---------------------------------------------------------------------------
// Mock Web Crypto API for Node/Vitest environment
// ---------------------------------------------------------------------------

const mockDigest = vi.fn(async (_algo: string, data: ArrayBuffer) => {
  // Simple deterministic fake hash for testing
  const bytes = new Uint8Array(data);
  const result = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i++) {
    result[i % 32] = (result[i % 32]! + bytes[i]!) & 0xff;
  }
  return result.buffer;
});

Object.defineProperty(globalThis, 'crypto', {
  value: {
    subtle: { digest: mockDigest },
    randomUUID: () => 'test-uuid-1234',
  },
  writable: true,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('demo-auth', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('isDemoMode', () => {
    it('returns true for empty URL', () => {
      expect(isDemoMode('')).toBe(true);
    });

    it('returns true for placeholder URL', () => {
      expect(isDemoMode('https://placeholder.supabase.co')).toBe(true);
    });

    it('returns false for a real URL', () => {
      expect(isDemoMode('https://myproject.supabase.co')).toBe(false);
    });
  });

  describe('session persistence', () => {
    it('persistDemoSession stores email in localStorage', () => {
      persistDemoSession('test@example.com');
      expect(localStorage.getItem('finance_demo_session')).toBe('test@example.com');
    });

    it('persistDemoSession normalizes email to lowercase', () => {
      persistDemoSession('Test@Example.COM');
      expect(localStorage.getItem('finance_demo_session')).toBe('test@example.com');
    });

    it('restoreDemoSession retrieves stored email', () => {
      localStorage.setItem('finance_demo_session', 'user@test.com');
      expect(restoreDemoSession()).toBe('user@test.com');
    });

    it('restoreDemoSession returns null when no session exists', () => {
      expect(restoreDemoSession()).toBeNull();
    });

    it('clearDemoSession removes the stored session', () => {
      localStorage.setItem('finance_demo_session', 'user@test.com');
      clearDemoSession();
      expect(localStorage.getItem('finance_demo_session')).toBeNull();
    });
  });

  describe('demoLogin', () => {
    it('persists session on successful login', async () => {
      await demoSignup('login@test.com', 'password123');
      await demoLogin('login@test.com', 'password123');

      expect(restoreDemoSession()).toBe('login@test.com');
    });

    it('returns a valid token and user info', async () => {
      await demoSignup('user@test.com', 'pass');
      const result = await demoLogin('user@test.com', 'pass');

      expect(result.accessToken).toContain('.');
      expect(result.user.email).toBe('user@test.com');
      expect(result.user.id).toContain('demo-');
    });

    it('throws on incorrect password', async () => {
      await demoSignup('user@test.com', 'pass');
      await expect(demoLogin('user@test.com', 'wrong')).rejects.toThrow('Incorrect password.');
    });

    it('throws on unknown email', async () => {
      await expect(demoLogin('nobody@test.com', 'pass')).rejects.toThrow(
        'No account found for that email.',
      );
    });
  });

  describe('demoRefreshToken', () => {
    it('returns a token for a valid email', () => {
      const token = demoRefreshToken('user@test.com');
      expect(token).not.toBeNull();
      expect(token!.split('.')).toHaveLength(3);
    });

    it('returns null for null email', () => {
      expect(demoRefreshToken(null)).toBeNull();
    });
  });
});
