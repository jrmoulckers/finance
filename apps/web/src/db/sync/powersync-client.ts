// SPDX-License-Identifier: BUSL-1.1

/**
 * PowerSync client integration for real-time sync.
 *
 * Wraps the PowerSync JS SDK to provide:
 *   - Configuration from environment variables
 *   - Connection lifecycle management
 *   - Sync rule definitions matching the KMP schema
 *   - Conflict resolution (server-wins with local fallback)
 *   - React hook for sync status and offline queue indicators
 *
 * The PowerSync client coexists with the existing custom sync system
 * (mutation queue + replay). When PowerSync is enabled, it takes over
 * as the primary sync path; the custom system remains as a fallback.
 *
 * References: issue #443
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** PowerSync connection configuration. */
export interface PowerSyncConfig {
  /** PowerSync instance URL (e.g. https://xyz.powersync.journeyapps.com). */
  readonly instanceUrl: string;
  /** Supabase project URL for authentication. */
  readonly supabaseUrl: string;
  /** Supabase anon key for token exchange. */
  readonly supabaseAnonKey: string;
  /** Whether PowerSync is enabled (feature flag). */
  readonly enabled: boolean;
}

/** Current PowerSync connection status. */
export type PowerSyncConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'syncing'
  | 'error';

/** Snapshot of the PowerSync sync state for the UI. */
export interface PowerSyncStatus {
  /** Current connection status. */
  readonly connectionStatus: PowerSyncConnectionStatus;
  /** Number of local changes waiting to be uploaded. */
  readonly pendingUploads: number;
  /** Number of remote changes waiting to be applied. */
  readonly pendingDownloads: number;
  /** ISO-8601 timestamp of the last successful sync. */
  readonly lastSyncTime: string | null;
  /** Whether the initial full sync has completed. */
  readonly hasSynced: boolean;
  /** Human-readable error message, if any. */
  readonly error: string | null;
}

/** Sync rule definition for a table. */
export interface SyncRule {
  /** Table name in the local SQLite database. */
  readonly tableName: string;
  /** Columns to sync (all columns if empty). */
  readonly columns: readonly string[];
  /** SQL filter expression for server-side filtering. */
  readonly filter?: string;
  /** Priority for sync ordering (lower = higher priority). */
  readonly priority: number;
}

/** Conflict resolution strategy. */
export type ConflictStrategy = 'server-wins' | 'client-wins' | 'manual';

/** A detected sync conflict. */
export interface SyncConflict {
  readonly tableName: string;
  readonly recordId: string;
  readonly localVersion: Record<string, unknown>;
  readonly serverVersion: Record<string, unknown>;
  readonly timestamp: string;
  readonly resolved: boolean;
  readonly resolution?: ConflictStrategy;
}

// ---------------------------------------------------------------------------
// Sync Rules — defines what tables/columns to sync
// ---------------------------------------------------------------------------

/**
 * Sync rules matching the KMP schema tables.
 *
 * These define the bidirectional sync scope for each entity type.
 * Priority determines sync ordering during initial sync.
 */
export const SYNC_RULES: readonly SyncRule[] = [
  {
    tableName: 'user',
    columns: [
      'id',
      'email',
      'display_name',
      'avatar_url',
      'default_currency',
      'created_at',
      'updated_at',
      'deleted_at',
      'sync_version',
      'is_synced',
    ],
    priority: 1,
  },
  {
    tableName: 'household',
    columns: [
      'id',
      'name',
      'owner_id',
      'created_at',
      'updated_at',
      'deleted_at',
      'sync_version',
      'is_synced',
    ],
    priority: 2,
  },
  {
    tableName: 'household_member',
    columns: [
      'id',
      'household_id',
      'user_id',
      'role',
      'joined_at',
      'created_at',
      'updated_at',
      'deleted_at',
      'sync_version',
      'is_synced',
    ],
    priority: 3,
  },
  {
    tableName: 'account',
    columns: [
      'id',
      'household_id',
      'name',
      'type',
      'currency',
      'current_balance',
      'is_archived',
      'sort_order',
      'icon',
      'color',
      'created_at',
      'updated_at',
      'deleted_at',
      'sync_version',
      'is_synced',
    ],
    priority: 4,
  },
  {
    tableName: 'category',
    columns: [
      'id',
      'household_id',
      'name',
      'icon',
      'color',
      'parent_id',
      'is_income',
      'is_system',
      'sort_order',
      'created_at',
      'updated_at',
      'deleted_at',
      'sync_version',
      'is_synced',
    ],
    priority: 5,
  },
  {
    tableName: 'transaction',
    columns: [
      'id',
      'household_id',
      'account_id',
      'category_id',
      'type',
      'status',
      'amount',
      'currency',
      'payee',
      'note',
      'date',
      'transfer_account_id',
      'transfer_transaction_id',
      'is_recurring',
      'recurring_rule_id',
      'tags',
      'splits',
      'created_at',
      'updated_at',
      'deleted_at',
      'sync_version',
      'is_synced',
    ],
    priority: 6,
  },
  {
    tableName: 'budget',
    columns: [
      'id',
      'household_id',
      'category_id',
      'name',
      'amount',
      'currency',
      'period',
      'start_date',
      'end_date',
      'is_rollover',
      'created_at',
      'updated_at',
      'deleted_at',
      'sync_version',
      'is_synced',
    ],
    priority: 7,
  },
  {
    tableName: 'goal',
    columns: [
      'id',
      'household_id',
      'name',
      'target_amount',
      'current_amount',
      'currency',
      'target_date',
      'status',
      'icon',
      'color',
      'account_id',
      'created_at',
      'updated_at',
      'deleted_at',
      'sync_version',
      'is_synced',
    ],
    priority: 8,
  },
];

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

let _config: PowerSyncConfig | null = null;

/**
 * Resolve PowerSync configuration from environment variables.
 *
 * Required env vars:
 *   - VITE_POWERSYNC_URL       — PowerSync instance URL
 *   - VITE_SUPABASE_URL        — Supabase project URL
 *   - VITE_SUPABASE_ANON_KEY   — Supabase anon/public key
 *   - VITE_POWERSYNC_ENABLED   — "true" to enable PowerSync
 */
export function resolvePowerSyncConfig(): PowerSyncConfig {
  const meta = import.meta as unknown as { env?: Record<string, string> };
  return {
    instanceUrl: meta.env?.VITE_POWERSYNC_URL ?? '',
    supabaseUrl: meta.env?.VITE_SUPABASE_URL ?? '',
    supabaseAnonKey: meta.env?.VITE_SUPABASE_ANON_KEY ?? '',
    enabled: meta.env?.VITE_POWERSYNC_ENABLED === 'true',
  };
}

/** Get the current PowerSync configuration. */
export function getPowerSyncConfig(): PowerSyncConfig {
  if (!_config) {
    _config = resolvePowerSyncConfig();
  }
  return _config;
}

/** Override the PowerSync configuration (e.g. for testing). */
export function setPowerSyncConfig(config: PowerSyncConfig): void {
  _config = config;
}

/** Check whether PowerSync is configured and enabled. */
export function isPowerSyncEnabled(): boolean {
  const config = getPowerSyncConfig();
  return config.enabled && config.instanceUrl.length > 0;
}

// ---------------------------------------------------------------------------
// Conflict Resolution
// ---------------------------------------------------------------------------

/** In-memory conflict store for pending conflicts. */
const _pendingConflicts: SyncConflict[] = [];

/**
 * Resolve a sync conflict using the specified strategy.
 *
 * - `server-wins`: Accept the server version (default).
 * - `client-wins`: Keep the local version and re-push.
 * - `manual`: Store for user review in the conflict resolution UI.
 */
export function resolveConflict(
  conflict: SyncConflict,
  strategy: ConflictStrategy = 'server-wins',
): Record<string, unknown> {
  const resolved = { ...conflict, resolved: true, resolution: strategy };

  switch (strategy) {
    case 'server-wins':
      return resolved.serverVersion;
    case 'client-wins':
      return resolved.localVersion;
    case 'manual':
      _pendingConflicts.push(resolved);
      return resolved.serverVersion; // Use server version until manual resolution
    default:
      return resolved.serverVersion;
  }
}

/** Get all unresolved conflicts pending manual review. */
export function getPendingConflicts(): readonly SyncConflict[] {
  return _pendingConflicts.filter((c) => !c.resolved || c.resolution === 'manual');
}

/** Clear resolved conflicts from the pending list. */
export function clearResolvedConflicts(): void {
  const unresolvedIndices = _pendingConflicts
    .map((c, i) => (!c.resolved ? i : -1))
    .filter((i) => i >= 0);
  const unresolved = unresolvedIndices.map((i) => _pendingConflicts[i]!);
  _pendingConflicts.length = 0;
  _pendingConflicts.push(...unresolved);
}

// ---------------------------------------------------------------------------
// PowerSync Status
// ---------------------------------------------------------------------------

const DEFAULT_STATUS: PowerSyncStatus = {
  connectionStatus: 'disconnected',
  pendingUploads: 0,
  pendingDownloads: 0,
  lastSyncTime: null,
  hasSynced: false,
  error: null,
};

let _currentStatus: PowerSyncStatus = { ...DEFAULT_STATUS };
const _statusListeners: Array<(status: PowerSyncStatus) => void> = [];

/** Get the current sync status snapshot. */
export function getPowerSyncStatus(): PowerSyncStatus {
  return _currentStatus;
}

/** Update the sync status and notify listeners. */
export function updatePowerSyncStatus(partial: Partial<PowerSyncStatus>): void {
  _currentStatus = { ..._currentStatus, ...partial };
  for (const listener of _statusListeners) {
    listener(_currentStatus);
  }
}

/** Subscribe to sync status changes. Returns an unsubscribe function. */
export function onPowerSyncStatusChange(listener: (status: PowerSyncStatus) => void): () => void {
  _statusListeners.push(listener);
  return () => {
    const index = _statusListeners.indexOf(listener);
    if (index >= 0) {
      _statusListeners.splice(index, 1);
    }
  };
}

/** Reset the sync status to defaults (e.g. on logout). */
export function resetPowerSyncStatus(): void {
  _currentStatus = { ...DEFAULT_STATUS };
  _statusListeners.length = 0;
}
