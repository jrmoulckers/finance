// SPDX-License-Identifier: BUSL-1.1

/**
 * Pull-based sync: fetch server-side changes since the last sync cursor.
 *
 * Complements the push-based {@link replayMutations} by downloading rows
 * that other devices (or the server) have modified since this client's
 * last pull timestamp.
 *
 * The pull endpoint returns a batch of changed rows plus a new cursor.
 * This module applies the changes to the local SQLite-WASM database and
 * persists the new cursor for the next pull.
 *
 * Design decisions:
 *   - Idempotent: re-applying the same batch is safe (UPSERT semantics).
 *   - Offline-safe: pull is a no-op when the network is unavailable.
 *   - Auth: uses the same token infrastructure as push sync.
 *
 * References: issue #535
 */

import { getAccessToken } from '../../auth/token-storage';
import { getSyncConfig } from './replayMutations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single changed row returned by the pull endpoint. */
export interface PullChange {
  /** Database table the change belongs to. */
  readonly tableName: string;
  /** Primary key of the row. */
  readonly recordId: string;
  /** The operation that created this change. */
  readonly operation: 'INSERT' | 'UPDATE' | 'DELETE';
  /** Row data for INSERT/UPDATE, `null` for DELETE. */
  readonly data: Record<string, unknown> | null;
  /** Server timestamp of the change (ms since epoch). */
  readonly timestamp: number;
}

/** Response shape from the pull endpoint. */
export interface PullResponse {
  /** Changed rows since the cursor. */
  readonly changes: PullChange[];
  /** New cursor for the next pull. */
  readonly cursor: string;
  /** Whether more changes are available beyond this batch. */
  readonly hasMore: boolean;
}

/** Result returned to callers after a pull cycle. */
export interface PullResult {
  /** Number of changes applied. */
  readonly appliedCount: number;
  /** Whether authentication failed. */
  readonly authError: boolean;
  /** Whether the pull was skipped (e.g. offline). */
  readonly skipped: boolean;
  /** Error message if pull failed (non-auth). */
  readonly error: string | null;
}

// ---------------------------------------------------------------------------
// Cursor persistence (localStorage)
// ---------------------------------------------------------------------------

const PULL_CURSOR_KEY = 'finance-pull-cursor';

/** Get the last pull cursor, or `null` for a full sync. */
export function getPullCursor(): string | null {
  try {
    return localStorage.getItem(PULL_CURSOR_KEY);
  } catch {
    return null;
  }
}

/** Persist the pull cursor for the next sync cycle. */
export function setPullCursor(cursor: string): void {
  try {
    localStorage.setItem(PULL_CURSOR_KEY, cursor);
  } catch {
    // localStorage may be unavailable in some contexts.
  }
}

/** Reset the pull cursor (forces a full re-sync on next pull). */
export function resetPullCursor(): void {
  try {
    localStorage.removeItem(PULL_CURSOR_KEY);
  } catch {
    // Ignore.
  }
}

// ---------------------------------------------------------------------------
// Pull implementation
// ---------------------------------------------------------------------------

/**
 * Fetch changes from the server since the last pull cursor.
 *
 * @param applyChanges  Callback to apply changes to the local database.
 *   Receives a batch of changes and should apply them via UPSERT/DELETE.
 *   If not provided, changes are fetched but not applied (dry run).
 */
export async function pullChanges(
  applyChanges?: (changes: PullChange[]) => Promise<void>,
): Promise<PullResult> {
  // Skip if offline.
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { appliedCount: 0, authError: false, skipped: true, error: null };
  }

  const config = getSyncConfig();
  const cursor = getPullCursor();

  // Build request.
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.apiKey) {
    headers['apikey'] = config.apiKey;
  }

  try {
    const token = await getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {
    // Proceed without auth — server will return 401 if required.
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    // Derive pull endpoint from push endpoint.
    // Handles both `/api/sync/push` → `/api/sync/pull` and `/sync-push` → `/sync-pull`.
    const pushPath = config.pushEndpoint;
    const pullPath = pushPath.replace(/push/i, 'pull');
    const pullUrl = `${config.baseUrl}${pullPath}`;
    const response = await fetch(pullUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ cursor, batchSize: 100 }),
      credentials: 'include',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 401 || response.status === 403) {
      return { appliedCount: 0, authError: true, skipped: false, error: null };
    }

    if (!response.ok) {
      return {
        appliedCount: 0,
        authError: false,
        skipped: false,
        error: `Pull failed with status ${response.status}`,
      };
    }

    const body = (await response.json()) as PullResponse;

    // Apply changes if callback provided.
    if (applyChanges && body.changes.length > 0) {
      await applyChanges(body.changes);
    }

    // Persist cursor for next pull.
    if (body.cursor) {
      setPullCursor(body.cursor);
    }

    return {
      appliedCount: body.changes.length,
      authError: false,
      skipped: false,
      error: null,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const message = err instanceof Error ? err.message : 'Unknown pull error';
    return { appliedCount: 0, authError: false, skipped: false, error: message };
  }
}
