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

import { WebMutationQueue } from './MutationQueue';
import {
  LAST_SYNC_TIME_KEY,
  REPLAY_BATCH_SIZE,
  type QueuedMutation,
  type SwToClientMessage,
} from './types';

// ---------------------------------------------------------------------------
// Server push (stub -- to be wired to real API)
// ---------------------------------------------------------------------------

/**
 * Push a batch of mutations to the server.
 *
 * Returns the IDs of mutations that were successfully accepted.  Mutations
 * whose IDs are NOT in the returned array are considered failed and will
 * be retried.
 *
 * **TODO:** Replace this stub with a real `fetch()` call to the sync
 * endpoint once the server API is available.
 */
async function pushToServer(mutations: QueuedMutation[]): Promise<string[]> {
  // The API base URL would come from env / config.  For now we attempt
  // a real POST and handle failures gracefully.
  const apiBase = self.location?.origin ?? '';
  const url = `${apiBase}/api/sync/push`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mutations }),
    });

    if (!response.ok) {
      // Server rejected the batch -- treat all as failed.
      return [];
    }

    const body = (await response.json()) as { acknowledged?: string[] };
    return body.acknowledged ?? mutations.map((m) => m.id);
  } catch {
    // Network error -- nothing was synced.
    return [];
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
}

/**
 * Replay pending offline mutations.
 *
 * 1. Dequeue up to {@link REPLAY_BATCH_SIZE} oldest mutations.
 * 2. Push them to the server.
 * 3. Acknowledge (remove) successfully synced mutations.
 * 4. Increment retry counters on failures; dead-letter if exhausted.
 * 5. Persist the last-sync timestamp.
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
    return { syncedCount: 0, failedCount: 0 };
  }

  broadcastResult?.({ type: 'SYNC_STARTED' });

  let syncedIds: string[];
  try {
    syncedIds = await pushToServer(pending);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sync error';
    broadcastResult?.({ type: 'SYNC_FAILED', error: message });
    return { syncedCount: 0, failedCount: pending.length };
  }

  // Acknowledge successful mutations.
  const syncedSet = new Set(syncedIds);
  if (syncedSet.size > 0) {
    await queue.acknowledge([...syncedSet]);
  }

  // Retry or dead-letter failed mutations.
  const failed = pending.filter((m) => !syncedSet.has(m.id));
  for (const mutation of failed) {
    await queue.retry(mutation);
  }

  // Persist last-sync timestamp (best-effort -- storage may not exist
  // in the service worker context).
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LAST_SYNC_TIME_KEY, new Date().toISOString());
    }
  } catch {
    // Ignore -- service workers don't have localStorage.
  }

  const result: ReplayResult = {
    syncedCount: syncedSet.size,
    failedCount: failed.length,
  };

  broadcastResult?.({
    type: 'SYNC_COMPLETED',
    syncedCount: result.syncedCount,
    failedCount: result.failedCount,
  });

  return result;
}
