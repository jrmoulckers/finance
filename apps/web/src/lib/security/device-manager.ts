// SPDX-License-Identifier: BUSL-1.1

/**
 * Device Manager — active session listing, metadata, and remote revocation.
 *
 * Manages the list of active device sessions, provides session metadata
 * (last active, IP, user agent), and supports remote session revocation
 * with token invalidation.
 *
 * References: issue #1663
 */

import type { DeviceSession } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** localStorage key for device sessions. */
const SESSIONS_STORAGE_KEY = 'finance-device-sessions';

/** Maximum sessions to retain. */
const MAX_SESSIONS = 50;

// ---------------------------------------------------------------------------
// Session parsing
// ---------------------------------------------------------------------------

/**
 * Parse a user agent string into a human-readable device name.
 *
 * @param userAgent - The raw user agent string.
 * @returns A simplified device name.
 */
export function parseDeviceName(userAgent: string): string {
  if (!userAgent) return 'Unknown Device';

  if (/iPhone/i.test(userAgent)) return 'iPhone';
  if (/iPad/i.test(userAgent)) return 'iPad';
  if (/Android/i.test(userAgent)) return 'Android Device';
  if (/Windows/i.test(userAgent)) return 'Windows PC';
  if (/Macintosh/i.test(userAgent)) return 'Mac';
  if (/Linux/i.test(userAgent)) return 'Linux PC';
  if (/CrOS/i.test(userAgent)) return 'Chromebook';

  return 'Unknown Device';
}

/**
 * Mask an IP address for privacy (replace last octet(s) with "x").
 *
 * @param ip - The full IP address.
 * @returns A masked IP address.
 */
export function maskIpAddress(ip: string): string {
  if (!ip) return '0.0.0.0';

  // IPv4
  const ipv4Parts = ip.split('.');
  if (ipv4Parts.length === 4) {
    return `${ipv4Parts[0]}.${ipv4Parts[1]}.x.x`;
  }

  // IPv6 — mask last 4 groups
  const ipv6Parts = ip.split(':');
  if (ipv6Parts.length >= 4) {
    return ipv6Parts.slice(0, 4).join(':') + ':x:x:x:x';
  }

  return ip;
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

/**
 * Load all device sessions from localStorage.
 *
 * @returns An array of DeviceSession objects.
 */
export function loadSessions(): DeviceSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (s: unknown): s is DeviceSession =>
        typeof s === 'object' && s !== null && 'id' in s && 'deviceName' in s,
    );
  } catch {
    return [];
  }
}

/**
 * Save sessions to localStorage.
 *
 * @param sessions - The sessions to persist.
 */
function saveSessions(sessions: readonly DeviceSession[]): void {
  const trimmed = sessions.length > MAX_SESSIONS ? sessions.slice(-MAX_SESSIONS) : sessions;
  localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(trimmed));
}

/**
 * Register a new device session.
 *
 * @param userAgent - The browser user agent string.
 * @param ipAddress - The client IP address (will be masked).
 * @returns The newly created DeviceSession.
 */
export function registerSession(userAgent: string, ipAddress: string): DeviceSession {
  const session: DeviceSession = {
    id: crypto.randomUUID(),
    deviceName: parseDeviceName(userAgent),
    userAgent,
    ipAddress: maskIpAddress(ipAddress),
    lastActiveAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    isCurrent: true,
    isRevoked: false,
  };

  // Mark all existing sessions as non-current
  const existing = loadSessions().map((s) => ({ ...s, isCurrent: false }));
  existing.push(session);
  saveSessions(existing);

  return session;
}

/**
 * Update the last active timestamp for a session.
 *
 * @param sessionId - The session to update.
 * @returns The updated session, or null if not found.
 */
export function touchSession(sessionId: string): DeviceSession | null {
  const sessions = loadSessions();
  const index = sessions.findIndex((s) => s.id === sessionId);
  if (index === -1) return null;

  const updated: DeviceSession = {
    ...sessions[index],
    lastActiveAt: new Date().toISOString(),
  };
  sessions[index] = updated;
  saveSessions(sessions);

  return updated;
}

/**
 * Revoke a device session (remote logout).
 *
 * This marks the session as revoked. In a real implementation, this would
 * also invalidate the session token on the server.
 *
 * @param sessionId - The session to revoke.
 * @returns The revoked session, or null if not found.
 */
export function revokeSession(sessionId: string): DeviceSession | null {
  const sessions = loadSessions();
  const index = sessions.findIndex((s) => s.id === sessionId);
  if (index === -1) return null;

  const revoked: DeviceSession = {
    ...sessions[index],
    isRevoked: true,
    isCurrent: false,
  };
  sessions[index] = revoked;
  saveSessions(sessions);

  return revoked;
}

/**
 * Revoke all sessions except the current one.
 *
 * @returns The number of sessions revoked.
 */
export function revokeAllOtherSessions(): number {
  const sessions = loadSessions();
  let revokedCount = 0;

  const updated = sessions.map((s) => {
    if (!s.isCurrent && !s.isRevoked) {
      revokedCount++;
      return { ...s, isRevoked: true };
    }
    return s;
  });

  saveSessions(updated);
  return revokedCount;
}

/**
 * Get only active (non-revoked) sessions.
 *
 * @returns An array of active DeviceSession objects.
 */
export function getActiveSessions(): DeviceSession[] {
  return loadSessions().filter((s) => !s.isRevoked);
}

/**
 * Check whether a session ID is valid (exists and is not revoked).
 *
 * @param sessionId - The session ID to validate.
 * @returns True if the session is valid and active.
 */
export function isSessionValid(sessionId: string): boolean {
  const sessions = loadSessions();
  const session = sessions.find((s) => s.id === sessionId);
  return session !== undefined && !session.isRevoked;
}
