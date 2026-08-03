// SPDX-License-Identifier: BUSL-1.1

/**
 * Bank connectivity repository (#3852).
 *
 * Read-only access to the PowerSync-synced bank connectivity tables:
 *   - `bank_connections`       — connection identity + display status (no token)
 *   - `bank_connection_health` — health history log
 *   - `aggregator_providers`   — global provider directory
 *
 * These tables are populated exclusively by the sync pull path; the client
 * never writes to them, so this repository exposes reads only. All financial
 * amounts are irrelevant here — this is connection metadata, not money.
 *
 * @module db/repositories/bank-connections
 */

import { query, type AsyncDb, type Row } from '../async-db';
import { optionalString, requireNumber, requireString, toBoolean } from './helpers';

// ---------------------------------------------------------------------------
// Public DTO types (re-exported by hooks/useBankConnections for consumers)
// ---------------------------------------------------------------------------

/** Computed health status of a bank connection. */
export type ConnectionHealthStatus =
  | 'healthy'
  | 'stale'
  | 'auth_expired'
  | 'provider_down'
  | 'rate_limited'
  | 'institution_error'
  | 'unknown_error';

/** Error category for structured reporting. */
export type ErrorCategory = 'auth' | 'provider' | 'institution' | 'network' | 'data' | 'rate_limit';

/** A bank connection with its latest health snapshot. */
export interface BankConnectionHealth {
  /** Connection ID. */
  id: string;
  /** Provider name (plaid, mx, etc.). */
  provider: string;
  /** Institution display name. */
  institutionName: string;
  /** Current connection status (active, needs_reauth, disconnected, error). */
  connectionStatus: string;
  /** Computed health status from the latest health snapshot. */
  healthStatus: ConnectionHealthStatus;
  /** Minutes since last successful sync (from the latest health snapshot). */
  stalenessMinutes: number | null;
  /** Structured error category (if any). */
  errorCategory: ErrorCategory | null;
  /** Error code from the provider (if any). */
  errorCode: string | null;
  /** Last successful sync timestamp. */
  lastSyncedAt: string | null;
  /** Permission level (read_only by default). */
  permissionLevel: string;
  /** Connection type (aggregator, open_banking, direct). */
  connectionType: string;
  /** Whether re-authentication is needed. */
  needsReauth: boolean;
}

/** A single health-history event for a connection. */
export interface HealthHistoryEvent {
  /** Event ID. */
  id: string;
  /** Health status at the time. */
  status: ConnectionHealthStatus;
  /** Error category at the time. */
  errorCategory: ErrorCategory | null;
  /** Error detail at the time. */
  errorDetail: string | null;
  /** Staleness in minutes at the time. */
  stalenessMinutes: number | null;
  /** When the issue was resolved (null if unresolved). */
  resolvedAt: string | null;
  /** How it was resolved. */
  resolutionAction: string | null;
  /** When this event was recorded. */
  createdAt: string;
}

/** An aggregator provider from the synced directory. */
export interface AggregatorProvider {
  /** Provider ID (row id). */
  id: string;
  /** Short name (plaid, mx, etc.). */
  name: string;
  /** Display name. */
  displayName: string;
  /** Provider type (aggregator, open_banking, direct). */
  providerType: string;
  /** Current health status. */
  status: string;
  /** Health score (0–100). */
  healthScore: number;
  /** Priority for failover ordering (lower = preferred). */
  priority: number;
  /** Whether the provider is enabled. */
  isEnabled: boolean;
  /** Supported regions (ISO 3166-1 alpha-2). */
  supportedRegions: string[];
  /** Provider capabilities. */
  capabilities: Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const VALID_HEALTH_STATUSES: ReadonlySet<string> = new Set([
  'healthy',
  'stale',
  'auth_expired',
  'provider_down',
  'rate_limited',
  'institution_error',
  'unknown_error',
]);

const VALID_ERROR_CATEGORIES: ReadonlySet<string> = new Set([
  'auth',
  'provider',
  'institution',
  'network',
  'data',
  'rate_limit',
]);

/** Read a nullable integer column. */
function optionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Narrow an arbitrary string to a known {@link ConnectionHealthStatus}. */
function toHealthStatus(value: unknown): ConnectionHealthStatus | null {
  return typeof value === 'string' && VALID_HEALTH_STATUSES.has(value)
    ? (value as ConnectionHealthStatus)
    : null;
}

/** Narrow an arbitrary string to a known {@link ErrorCategory}. */
function toErrorCategory(value: unknown): ErrorCategory | null {
  return typeof value === 'string' && VALID_ERROR_CATEGORIES.has(value)
    ? (value as ErrorCategory)
    : null;
}

/**
 * Derive a health status when a connection has no health-history rows yet,
 * mapping the connection's own status onto the closest health category.
 */
function fallbackHealthStatus(connectionStatus: string): ConnectionHealthStatus {
  switch (connectionStatus) {
    case 'active':
      return 'healthy';
    case 'needs_reauth':
      return 'auth_expired';
    case 'disconnected':
      return 'provider_down';
    default:
      return 'unknown_error';
  }
}

/** Parse a JSON array of region strings, tolerating malformed data. */
function parseRegions(value: unknown): string[] {
  if (typeof value !== 'string' || value.trim().length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === 'string') : [];
  } catch {
    return [];
  }
}

/** Parse a JSON object of boolean capability flags, tolerating malformed data. */
function parseCapabilities(value: unknown): Record<string, boolean> {
  if (typeof value !== 'string' || value.trim().length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, boolean> = {};
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      out[key] = Boolean(val);
    }
    return out;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

/**
 * Join `bank_connections` with its latest `bank_connection_health` snapshot and
 * its provider directory entry so a single row carries everything the health
 * dashboard needs.
 */
const CONNECTION_HEALTH_QUERY = `
  SELECT
    c.id                    AS id,
    c.provider              AS provider,
    c.institution_name      AS institution_name,
    c.status                AS connection_status,
    c.last_synced_at        AS connection_last_synced_at,
    c.error_code            AS error_code,
    h.status                AS health_status,
    h.error_category        AS error_category,
    h.staleness_minutes     AS staleness_minutes,
    h.last_successful_sync  AS last_successful_sync,
    p.provider_type         AS provider_type
  FROM bank_connections c
  LEFT JOIN (
    SELECT bh.bank_connection_id, bh.status, bh.error_category,
           bh.staleness_minutes, bh.last_successful_sync
    FROM bank_connection_health bh
    JOIN (
      SELECT bank_connection_id, MAX(created_at) AS max_created
      FROM bank_connection_health
      GROUP BY bank_connection_id
    ) latest
      ON latest.bank_connection_id = bh.bank_connection_id
      AND latest.max_created = bh.created_at
  ) h ON h.bank_connection_id = c.id
  LEFT JOIN aggregator_providers p ON p.name = c.provider
  WHERE c.deleted_at IS NULL
  ORDER BY c.institution_name COLLATE NOCASE
`;

function mapConnectionHealth(row: Row): BankConnectionHealth {
  const connectionStatus = requireString(row.connection_status, 'connection_status');
  const healthStatus = toHealthStatus(row.health_status) ?? fallbackHealthStatus(connectionStatus);
  const providerType = optionalString(row.provider_type) ?? 'aggregator';

  return {
    id: requireString(row.id, 'id'),
    provider: requireString(row.provider, 'provider'),
    institutionName: requireString(row.institution_name, 'institution_name'),
    connectionStatus,
    healthStatus,
    stalenessMinutes: optionalNumber(row.staleness_minutes),
    errorCategory: toErrorCategory(row.error_category),
    errorCode: optionalString(row.error_code),
    lastSyncedAt:
      optionalString(row.last_successful_sync) ?? optionalString(row.connection_last_synced_at),
    permissionLevel: 'read_only',
    connectionType: providerType,
    needsReauth: connectionStatus === 'needs_reauth' || healthStatus === 'auth_expired',
  };
}

function mapHealthHistory(row: Row): HealthHistoryEvent {
  return {
    id: requireString(row.id, 'id'),
    status: toHealthStatus(row.status) ?? 'unknown_error',
    errorCategory: toErrorCategory(row.error_category),
    errorDetail: optionalString(row.error_detail),
    stalenessMinutes: optionalNumber(row.staleness_minutes),
    resolvedAt: optionalString(row.resolved_at),
    resolutionAction: optionalString(row.resolution_action),
    createdAt: requireString(row.created_at, 'created_at'),
  };
}

function mapAggregatorProvider(row: Row): AggregatorProvider {
  return {
    id: requireString(row.id, 'id'),
    name: requireString(row.name, 'name'),
    displayName: requireString(row.display_name, 'display_name'),
    providerType: requireString(row.provider_type, 'provider_type'),
    status: requireString(row.status, 'status'),
    healthScore: requireNumber(row.health_score, 'health_score'),
    priority: requireNumber(row.priority, 'priority'),
    isEnabled: toBoolean(row.is_enabled),
    supportedRegions: parseRegions(row.supported_regions),
    capabilities: parseCapabilities(row.capabilities),
  };
}

// ---------------------------------------------------------------------------
// Public read API
// ---------------------------------------------------------------------------

/**
 * List all active bank connections with their latest health snapshot.
 *
 * @param db - The local SQLite database.
 * @returns One {@link BankConnectionHealth} per non-deleted connection.
 */
export async function listBankConnectionHealth(db: AsyncDb): Promise<BankConnectionHealth[]> {
  const { rows } = await query(db, CONNECTION_HEALTH_QUERY);
  return rows.map(mapConnectionHealth);
}

/**
 * List the aggregator provider directory, ordered by failover priority.
 *
 * @param db - The local SQLite database.
 * @returns The enabled, non-deleted {@link AggregatorProvider} entries.
 */
export async function listAggregatorProviders(db: AsyncDb): Promise<AggregatorProvider[]> {
  const { rows } = await query(
    db,
    `SELECT id, name, display_name, provider_type, status, health_score,
            priority, is_enabled, supported_regions, capabilities
     FROM aggregator_providers
     WHERE deleted_at IS NULL
     ORDER BY priority ASC, name ASC`,
  );
  return rows.map(mapAggregatorProvider);
}

/**
 * List the health history for a single connection, most recent first.
 *
 * @param db - The local SQLite database.
 * @param connectionId - The `bank_connections.id` to fetch history for.
 * @param limit - Maximum number of events to return. @default 100
 * @returns The connection's {@link HealthHistoryEvent}s, newest first.
 */
export async function listHealthHistory(
  db: AsyncDb,
  connectionId: string,
  limit = 100,
): Promise<HealthHistoryEvent[]> {
  const { rows } = await query(
    db,
    `SELECT id, status, error_category, error_detail, staleness_minutes,
            resolved_at, resolution_action, created_at
     FROM bank_connection_health
     WHERE bank_connection_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [connectionId, limit],
  );
  return rows.map(mapHealthHistory);
}
