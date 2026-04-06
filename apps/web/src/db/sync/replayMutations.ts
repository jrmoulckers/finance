// SPDX-License-Identifier: BUSL-1.1

/**
 * Mutation replay logic -- shared between the service worker and the
 * main-thread fallback.
 *
 * This module opens its own IndexedDB connection, reads a batch of pending
 * mutations, pushes them to the server, and acknowledges the successful
 * ones.  Failed mutations have their retry counter incremented; mutations
 * that exceed {@link MAX_RETRY_COUNT} are dead-lettered (removed).
 *
 * The module is intentionally free of DOM, React, and service-worker-specific
 * APIs so it can be imported from either context.
 *
 * References: issue #416
 */

import { getAccessToken } from '../../auth/token-storage';
import { WebMutationQueue } from './MutationQueue';
import { storeConflicts, type SyncConflict } from './sync-conflict';
import {
  LAST_SYNC_TIME_KEY,
  REPLAY_BATCH_SIZE,
  type QueuedMutation,
  type SwToClientMessage,
} from './types';

// ---------------------------------------------------------------------------
// Sync configuration
// ---------------------------------------------------------------------------

/** Configuration for the sync endpoint. */
export interface SyncConfig {
  /** Base URL for the API (defaults to current origin). */
  baseUrl: string;
  /** Path to the push endpoint. */
  pushEndpoint: string;
  /** Request timeout in milliseconds. */
  timeout: number;
  /** Supabase anon key sent as the `apikey` header. */
  apiKey?: string;
}

// Module-level runtime configuration (set via configureSyncEndpoint).
let _runtimeConfig: Partial<SyncConfig> | null = null;

/**
 * Configure the sync endpoint at runtime.
 *
 * Called during app bootstrap (e.g. in main.tsx) to set the Supabase
 * Edge Function URL and anon key.  The service worker uses the
 * compiled-in defaults from getSyncConfig() since it runs in a
 * separate context.
 */
export function configureSyncEndpoint(config: Partial<SyncConfig>): void {
  _runtimeConfig = config;
}

/**
 * Reset the sync configuration to defaults.
 *
 * @internal Exposed for testing — not part of the public API.
 */
export function resetSyncConfig(): void {
  _runtimeConfig = null;
}

/** Returns the merged sync configuration (runtime overrides win). */
export function getSyncConfig(): SyncConfig {
  const defaults: SyncConfig = {
    baseUrl: self.location?.origin ?? '',
    pushEndpoint: '/api/sync/push',
    timeout: 30_000,
  };

  if (_runtimeConfig) {
    return { ...defaults, ..._runtimeConfig };
  }

  return defaults;
}

// ---------------------------------------------------------------------------
// Push result
// ---------------------------------------------------------------------------

/** Internal result from a push attempt, capturing all possible outcomes. */
interface PushResult {
  /** IDs of mutations the server successfully accepted. */
  acknowledged: string[];
  /** Conflicts the server detected (409 response). */
  conflicts: SyncConflict[];
  /** Whether the push failed due to an authentication error (401/403). */
  authError: boolean;
  /** Whether the push was rate-limited (429). */
  rateLimited: boolean;
  /** Milliseconds to wait before retrying (from Retry-After header), or `null`. */
  retryAfterMs: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate exponential backoff delay based on retry count.
 * Capped at 30 seconds.
 */
function calculateBackoffMs(retryCount: number): number {
  return Math.min(1000 * 2 ** retryCount, 30_000);
}

/**
 * Parse the `Retry-After` header value into milliseconds.
 * Supports both delta-seconds and HTTP-date formats.
 */
function parseRetryAfter(headerValue: string | null): number | null {
  if (!headerValue) return null;

  // Try parsing as integer (seconds).
  const seconds = Number.parseInt(headerValue, 10);
  if (!Number.isNaN(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  // Try parsing as HTTP-date.
  const date = new Date(headerValue);
  if (!Number.isNaN(date.getTime())) {
    const delayMs = date.getTime() - Date.now();
    return delayMs > 0 ? delayMs : null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Server push
// ---------------------------------------------------------------------------

/**
 * Push a batch of mutations to the server.
 *
 * Handles authentication headers, error categorisation, exponential
 * backoff, and conflict detection.  Never throws — all errors are
 * captured in the returned {@link PushResult}.
 *
 * Error categorisation:
 *   - 401/403 → auth issue, user needs to re-login (skip retry)
 *   - 409     → conflict, needs UI resolution
 *   - 429     → rate limited, respect `Retry-After` header
 *   - 5xx     → transient server error, retry with backoff
 *   - Network → transient, retry with backoff
 */
async function pushToServer(mutations: QueuedMutation[]): Promise<PushResult> {
  const config = getSyncConfig();

  // -- Exponential backoff based on the highest retry count in the batch.
  const maxRetryCount = Math.max(0, ...mutations.map((m) => m.retryCount));
  if (maxRetryCount > 0) {
    const delay = calculateBackoffMs(maxRetryCount);
    await new Promise((r) => setTimeout(r, delay));
  }

  // -- Build request headers (auth + content-type).
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // -- Add Supabase anon key if configured.
  if (config.apiKey) {
    headers['apikey'] = config.apiKey;
  }

  try {
    const token = await getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {
    // Token retrieval failed — proceed without auth header.
    // The server will return 401 if authentication is required.
  }

  // -- Send the request with a timeout via AbortController.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    const response = await fetch(`${config.baseUrl}${config.pushEndpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ mutations }),
      credentials: 'include',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // -- Auth error (401 / 403): do not retry, user must re-authenticate.
    if (response.status === 401 || response.status === 403) {
      return {
        acknowledged: [],
        conflicts: [],
        authError: true,
        rateLimited: false,
        retryAfterMs: null,
      };
    }

    // -- Rate limited (429): respect Retry-After header.
    if (response.status === 429) {
      const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'));
      return {
        acknowledged: [],
        conflicts: [],
        authError: false,
        rateLimited: true,
        retryAfterMs,
      };
    }

    // -- Conflict (409): extract conflict details from response body.
    if (response.status === 409) {
      const body = (await response.json()) as {
        acknowledged?: string[];
        conflicts?: SyncConflict[];
      };
      return {
        acknowledged: body.acknowledged ?? [],
        conflicts: body.conflicts ?? [],
        authError: false,
        rateLimited: false,
        retryAfterMs: null,
      };
    }

    // -- Server error (5xx): transient failure, will retry with backoff.
    if (response.status >= 500) {
      return {
        acknowledged: [],
        conflicts: [],
        authError: false,
        rateLimited: false,
        retryAfterMs: null,
      };
    }

    // -- Other non-OK status: treat as failure.
    if (!response.ok) {
      return {
        acknowledged: [],
        conflicts: [],
        authError: false,
        rateLimited: false,
        retryAfterMs: null,
      };
    }

    // -- Success (2xx): extract acknowledged IDs and any conflicts.
    const body = (await response.json()) as {
      acknowledged?: string[];
      conflicts?: SyncConflict[];
    };

    return {
      acknowledged: body.acknowledged ?? mutations.map((m) => m.id),
      conflicts: body.conflicts ?? [],
      authError: false,
      rateLimited: false,
      retryAfterMs: null,
    };
  } catch {
    // Network error or abort — transient failure.
    clearTimeout(timeoutId);
    return {
      acknowledged: [],
      conflicts: [],
      authError: false,
      rateLimited: false,
      retryAfterMs: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Replay orchestrator
// ---------------------------------------------------------------------------

export interface ReplayResult {
  /** Number of mutations successfully pushed. */
  syncedCount: number;
  /** Number of mutations that failed (and were retried or dead-lettered). */
  failedCount: number;
  /** Number of conflicts detected that need UI resolution. */
  conflictCount: number;
  /** Whether sync failed due to an authentication error. */
  authError: boolean;
}

/**
 * Replay pending offline mutations.
 *
 * 1. Dequeue up to {@link REPLAY_BATCH_SIZE} oldest mutations.
 * 2. Push them to the server with auth headers and backoff.
 * 3. Acknowledge (remove) successfully synced mutations.
 * 4. Store any conflicts for UI resolution.
 * 5. Increment retry counters on transient failures; dead-letter if exhausted.
 * 6. Persist the last-sync timestamp.
 *
 * @param broadcastResult  Optional callback to broadcast the result to
 *   main-thread clients (used by the service worker).
 */
export async function replayMutations(
  broadcastResult?: (message: SwToClientMessage) => void,
): Promise<ReplayResult> {
  const queue = new WebMutationQueue();

  const pending = await queue.dequeue(REPLAY_BATCH_SIZE);

  if (pending.length === 0) {
    return { syncedCount: 0, failedCount: 0, conflictCount: 0, authError: false };
  }

  broadcastResult?.({ type: 'SYNC_STARTED' });

  const result = await pushToServer(pending);

  // -- Handle auth errors: leave mutations in queue untouched (no retry
  //    count increment) so they can be retried after re-authentication.
  if (result.authError) {
    broadcastResult?.({
      type: 'SYNC_FAILED',
      error: 'Authentication required. Please sign in again.',
      authError: true,
    });
    return {
      syncedCount: 0,
      failedCount: pending.length,
      conflictCount: 0,
      authError: true,
    };
  }

  // -- Handle rate limiting: leave mutations in queue untouched and wait
  //    for the Retry-After period if the server specified one.
  if (result.rateLimited) {
    if (result.retryAfterMs != null && result.retryAfterMs > 0) {
      await new Promise((r) => setTimeout(r, result.retryAfterMs as number));
    }
    broadcastResult?.({
      type: 'SYNC_FAILED',
      error: 'Rate limited by server. Will retry shortly.',
    });
    return {
      syncedCount: 0,
      failedCount: pending.length,
      conflictCount: 0,
      authError: false,
    };
  }

  // -- Store any conflicts returned by the server for UI resolution.
  if (result.conflicts.length > 0) {
    await storeConflicts(result.conflicts);
  }

  // -- Acknowledge successful mutations (remove from queue).
  const syncedSet = new Set(result.acknowledged);
  if (syncedSet.size > 0) {
    await queue.acknowledge([...syncedSet]);
  }

  // -- Determine which mutations need retry.  Mutations that are
  //    acknowledged or involved in a conflict are excluded.
  const conflictMutationIds = new Set(result.conflicts.map((c) => c.mutationId));
  const failed = pending.filter((m) => !syncedSet.has(m.id) && !conflictMutationIds.has(m.id));

  // Retry or dead-letter failed mutations (transient errors only).
  for (const mutation of failed) {
    await queue.retry(mutation);
  }

  // Acknowledge conflict mutations — they need manual resolution,
  // not automatic retry.
  if (conflictMutationIds.size > 0) {
    await queue.acknowledge([...conflictMutationIds]);
  }

  // Persist last-sync timestamp (best-effort — storage may not exist
  // in the service worker context).
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LAST_SYNC_TIME_KEY, new Date().toISOString());
    }
  } catch {
    // Ignore — service workers don't have localStorage.
  }

  const replayResult: ReplayResult = {
    syncedCount: syncedSet.size,
    failedCount: failed.length,
    conflictCount: result.conflicts.length,
    authError: false,
  };

  broadcastResult?.({
    type: 'SYNC_COMPLETED',
    syncedCount: replayResult.syncedCount,
    failedCount: replayResult.failedCount,
    conflictCount: replayResult.conflictCount,
  });

  return replayResult;
}
