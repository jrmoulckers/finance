// SPDX-License-Identifier: BUSL-1.1

/**
 * Connection Transparency — third-party connection management and revocation.
 *
 * Lists all third-party connections (aggregators, sync providers, etc.),
 * shows permission scopes, supports revocation workflows, and tracks
 * last access timestamps.
 *
 * References: issue #1677
 */

import type { ConnectionRecord, ConnectionStatus } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** localStorage key for connection records. */
const CONNECTIONS_STORAGE_KEY = 'finance-connections';

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * Load all connection records from localStorage.
 *
 * @returns An array of ConnectionRecord objects.
 */
export function loadConnections(): ConnectionRecord[] {
  try {
    const raw = localStorage.getItem(CONNECTIONS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (c: unknown): c is ConnectionRecord =>
        typeof c === 'object' && c !== null && 'id' in c && 'providerName' in c,
    );
  } catch {
    return [];
  }
}

/**
 * Save connection records to localStorage.
 *
 * @param connections - The connection records to persist.
 */
function saveConnections(connections: readonly ConnectionRecord[]): void {
  localStorage.setItem(CONNECTIONS_STORAGE_KEY, JSON.stringify(connections));
}

// ---------------------------------------------------------------------------
// Connection management
// ---------------------------------------------------------------------------

/**
 * Register a new third-party connection.
 *
 * @param providerName - Name of the third-party provider.
 * @param providerType - Type of connection.
 * @param scopes - Permission scopes granted.
 * @param expiresAt - Optional expiry date (ISO-8601).
 * @returns The newly created ConnectionRecord.
 */
export function addConnection(
  providerName: string,
  providerType: ConnectionRecord['providerType'],
  scopes: readonly string[],
  expiresAt: string | null = null,
): ConnectionRecord {
  const connection: ConnectionRecord = {
    id: crypto.randomUUID(),
    providerName,
    providerType,
    status: 'active',
    scopes,
    connectedAt: new Date().toISOString(),
    lastAccessedAt: null,
    expiresAt,
  };

  const existing = loadConnections();
  existing.push(connection);
  saveConnections(existing);

  return connection;
}

/**
 * Update the status of a connection.
 *
 * @param connectionId - The connection to update.
 * @param newStatus - The new status.
 * @returns The updated ConnectionRecord, or null if not found.
 */
export function updateConnectionStatus(
  connectionId: string,
  newStatus: ConnectionStatus,
): ConnectionRecord | null {
  const connections = loadConnections();
  const index = connections.findIndex((c) => c.id === connectionId);
  if (index === -1) return null;

  const updated: ConnectionRecord = {
    ...connections[index],
    status: newStatus,
  };
  connections[index] = updated;
  saveConnections(connections);

  return updated;
}

/**
 * Revoke a third-party connection.
 *
 * Sets the connection status to 'revoked'. In a real implementation,
 * this would also call the provider's revocation API endpoint.
 *
 * @param connectionId - The connection to revoke.
 * @returns The revoked ConnectionRecord, or null if not found.
 */
export function revokeConnection(connectionId: string): ConnectionRecord | null {
  return updateConnectionStatus(connectionId, 'revoked');
}

/**
 * Record a data access event by a connection.
 *
 * Updates the lastAccessedAt timestamp for the connection.
 *
 * @param connectionId - The connection that accessed data.
 * @returns The updated ConnectionRecord, or null if not found.
 */
export function recordConnectionAccess(connectionId: string): ConnectionRecord | null {
  const connections = loadConnections();
  const index = connections.findIndex((c) => c.id === connectionId);
  if (index === -1) return null;

  const updated: ConnectionRecord = {
    ...connections[index],
    lastAccessedAt: new Date().toISOString(),
  };
  connections[index] = updated;
  saveConnections(connections);

  return updated;
}

/**
 * Get all active (non-revoked, non-expired) connections.
 *
 * @returns An array of active ConnectionRecord objects.
 */
export function getActiveConnections(): ConnectionRecord[] {
  const now = new Date();
  return loadConnections().filter((c) => {
    if (c.status === 'revoked') return false;
    if (c.expiresAt && new Date(c.expiresAt) < now) return false;
    return true;
  });
}

/**
 * Get connections filtered by provider type.
 *
 * @param providerType - The type to filter by.
 * @returns An array of matching ConnectionRecord objects.
 */
export function getConnectionsByType(
  providerType: ConnectionRecord['providerType'],
): ConnectionRecord[] {
  return loadConnections().filter((c) => c.providerType === providerType);
}

/**
 * Get the permission scopes summary for all active connections.
 *
 * @returns A map of provider name to granted scopes.
 */
export function getScopesSummary(): Map<string, readonly string[]> {
  const active = getActiveConnections();
  const summary = new Map<string, readonly string[]>();

  for (const conn of active) {
    summary.set(conn.providerName, conn.scopes);
  }

  return summary;
}
