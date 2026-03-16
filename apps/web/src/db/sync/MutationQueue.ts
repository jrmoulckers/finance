// SPDX-License-Identifier: BUSL-1.1

/**
 * Offline mutation queue backed by IndexedDB.
 *
 * Provides a durable, ordered queue of local write operations that have not
 * yet been pushed to the server.  Mutations survive page reloads, service
 * worker restarts, and browser crashes because they are persisted in
 * IndexedDB rather than in-memory state.
 *
 * This class is safe to use from both the main thread and the service worker
 * context -- it has no dependencies on React or the DOM beyond `indexedDB`
 * and `crypto.randomUUID()`.
 *
 * Usage:
 * ```ts
 * const queue = new WebMutationQueue();
 * await queue.enqueue({
 *   tableName: 'transaction',
 *   recordId: 'abc-123',
 *   operation: 'INSERT',
 *   data: { amount: 1500, payee: 'Grocery Store' },
 *   householdId: 'hh-1',
 * });
 * const pending = await queue.dequeue(50);
 * // ... push to server ...
 * await queue.acknowledge(pending.map(m => m.id));
 * ```
 *
 * References: issue #416
 */

import {
  clearMutations,
  countMutations,
  deleteMutations,
  getMutationBatch,
  putMutation,
} from './idb';
import { MAX_RETRY_COUNT, type MutationOperation, type QueuedMutation } from './types';

// ---------------------------------------------------------------------------
// Enqueue input (subset -- id / timestamp / retryCount are generated)
// ---------------------------------------------------------------------------

/** Input for enqueuing a new mutation (without auto-generated fields). */
export interface EnqueueInput {
  /** Database table the mutation targets. */
  readonly tableName: string;
  /** Primary key of the affected row. */
  readonly recordId: string;
  /** The write operation performed locally. */
  readonly operation: MutationOperation;
  /** Row data snapshot for INSERT/UPDATE; `null` for DELETE. */
  readonly data: Record<string, unknown> | null;
  /** Household scope for server-side routing. */
  readonly householdId: string;
}

// ---------------------------------------------------------------------------
// WebMutationQueue
// ---------------------------------------------------------------------------

/**
 * Durable offline mutation queue.
 *
 * All methods are async because they interact with IndexedDB.  The class
 * is stateless -- every call opens (and closes) its own IndexedDB
 * connection so there is no risk of holding a stale handle.
 */
export class WebMutationQueue {
  // -------------------------------------------------------------------------
  // Enqueue
  // -------------------------------------------------------------------------

  /**
   * Append a mutation to the end of the queue.
   *
   * The mutation is assigned a unique ID and the current timestamp.  The
   * retry count starts at zero.
   */
  async enqueue(input: EnqueueInput): Promise<QueuedMutation> {
    const mutation: QueuedMutation = {
      id: crypto.randomUUID(),
      tableName: input.tableName,
      recordId: input.recordId,
      operation: input.operation,
      data: input.data,
      timestamp: Date.now(),
      retryCount: 0,
      householdId: input.householdId,
    };

    await putMutation(mutation);
    return mutation;
  }

  // -------------------------------------------------------------------------
  // Dequeue (peek -- does NOT remove)
  // -------------------------------------------------------------------------

  /**
   * Retrieve up to `count` of the oldest pending mutations.
   *
   * The mutations are **not** removed from the queue -- call
   * {@link acknowledge} after they have been successfully pushed to the
   * server.
   *
   * @param count  Maximum number of mutations to return. Defaults to 50.
   */
  async dequeue(count = 50): Promise<QueuedMutation[]> {
    return getMutationBatch(count);
  }

  // -------------------------------------------------------------------------
  // Acknowledge (remove successfully synced mutations)
  // -------------------------------------------------------------------------

  /**
   * Remove mutations from the queue after they have been successfully
   * pushed to the server.
   */
  async acknowledge(ids: readonly string[]): Promise<void> {
    await deleteMutations(ids);
  }

  // -------------------------------------------------------------------------
  // Retry bookkeeping
  // -------------------------------------------------------------------------

  /**
   * Increment the retry counter for a failed mutation and re-persist it.
   *
   * If the mutation has exceeded {@link MAX_RETRY_COUNT}, it is removed
   * from the queue (dead-lettered) and `false` is returned.
   *
   * @returns `true` if the mutation was re-queued, `false` if dead-lettered.
   */
  async retry(mutation: QueuedMutation): Promise<boolean> {
    const nextRetry = mutation.retryCount + 1;

    if (nextRetry > MAX_RETRY_COUNT) {
      // Dead-letter: remove from queue.
      await deleteMutations([mutation.id]);
      return false;
    }

    const updated: QueuedMutation = { ...mutation, retryCount: nextRetry };
    await putMutation(updated);
    return true;
  }

  // -------------------------------------------------------------------------
  // Inspection helpers
  // -------------------------------------------------------------------------

  /** Return the number of mutations currently in the queue. */
  async getPendingCount(): Promise<number> {
    return countMutations();
  }

  /** Remove all mutations from the queue. */
  async clear(): Promise<void> {
    await clearMutations();
  }
}
