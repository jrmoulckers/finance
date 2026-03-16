// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared types for the offline mutation queue and sync system.
 *
 * These types are used by both the main thread (React hooks, repositories)
 * and the service worker context.  They must remain free of DOM/React
 * dependencies so the service worker can import them.
 *
 * References: issue #416
 */

// ---------------------------------------------------------------------------
// Mutation operations
// ---------------------------------------------------------------------------

/** The type of write operation that was performed locally. */
export type MutationOperation = 'INSERT' | 'UPDATE' | 'DELETE';

// ---------------------------------------------------------------------------
// Queued mutation
// ---------------------------------------------------------------------------

/**
 * A single mutation recorded while the device is offline (or batched for
 * eventual sync).
 *
 * Stored in IndexedDB so that mutations survive page reloads and service
 * worker restarts.
 */
export interface QueuedMutation {
  /** Unique identifier for this queue entry (UUID). */
  readonly id: string;
  /** Database table the mutation targets (e.g. "transaction", "account"). */
  readonly tableName: string;
  /** Primary key of the affected row. */
  readonly recordId: string;
  /** The write operation that was performed locally. */
  readonly operation: MutationOperation;
  /**
   * Snapshot of the row data for INSERT/UPDATE operations.
   * `null` for DELETE operations.
   */
  readonly data: Record<string, unknown> | null;
  /** Unix epoch milliseconds when the mutation was enqueued. */
  readonly timestamp: number;
  /** Number of times replay has been attempted (starts at 0). */
  retryCount: number;
  /** Household scope for server-side routing. */
  readonly householdId: string;
}

// ---------------------------------------------------------------------------
// Sync status
// ---------------------------------------------------------------------------

/** Snapshot of the current sync state, consumed by the UI. */
export interface SyncStatus {
  /** Whether the browser reports network connectivity. */
  readonly isOnline: boolean;
  /** Number of mutations waiting to be pushed to the server. */
  readonly pendingMutations: number;
  /** ISO-8601 timestamp of the last successful sync, or `null` if never. */
  readonly lastSyncTime: string | null;
  /** Whether a sync operation is currently in progress. */
  readonly isSyncing: boolean;
}

// ---------------------------------------------------------------------------
// Service-worker <-> main-thread messages
// ---------------------------------------------------------------------------

/** Messages sent FROM the main thread TO the service worker. */
export type ClientToSwMessage =
  | { readonly type: 'REGISTER_SYNC' }
  | { readonly type: 'SKIP_WAITING' }
  | { readonly type: 'SYNC_NOW' }
  | { readonly type: 'GET_PENDING_COUNT' };

/** Messages sent FROM the service worker TO the main thread. */
export type SwToClientMessage =
  | { readonly type: 'SYNC_STARTED' }
  | { readonly type: 'SYNC_COMPLETED'; readonly syncedCount: number; readonly failedCount: number }
  | { readonly type: 'SYNC_FAILED'; readonly error: string }
  | { readonly type: 'PENDING_COUNT'; readonly count: number };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** IndexedDB database name for the mutation queue. */
export const MUTATION_QUEUE_DB_NAME = 'finance-mutation-queue';

/** IndexedDB object store name. */
export const MUTATION_QUEUE_STORE_NAME = 'mutations';

/** IndexedDB database version. */
export const MUTATION_QUEUE_DB_VERSION = 1;

/** Maximum number of retry attempts before a mutation is dead-lettered. */
export const MAX_RETRY_COUNT = 5;

/** Background Sync tag registered with the service worker. */
export const SYNC_TAG = 'finance-offline-mutations';

/** localStorage key for persisting the last successful sync timestamp. */
export const LAST_SYNC_TIME_KEY = 'finance-last-sync-time';

/** Interval (ms) for the periodic sync fallback when Background Sync is unavailable. */
export const PERIODIC_SYNC_INTERVAL_MS = 30_000;

/** Maximum number of mutations to replay in a single batch. */
export const REPLAY_BATCH_SIZE = 50;
