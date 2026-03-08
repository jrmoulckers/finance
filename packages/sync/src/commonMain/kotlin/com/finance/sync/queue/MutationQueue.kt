// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.queue

import com.finance.sync.SyncMutation

/**
 * A FIFO queue of [SyncMutation]s awaiting push to the sync backend.
 *
 * Implementations must be safe for concurrent access from multiple coroutines.
 */
interface MutationQueue {

    /**
     * Add a mutation to the tail of the queue.
     *
     * If a mutation for the same [SyncMutation.entityKey] is already enqueued,
     * the implementation may (but is not required to) deduplicate.
     */
    suspend fun enqueue(mutation: SyncMutation)

    /**
     * Return the mutation at the head of the queue without removing it,
     * or `null` if the queue is empty.
     */
    suspend fun peek(): SyncMutation?

    /**
     * Remove the mutation with the given [id] from the queue.
     * No-op if the ID is not found.
     */
    suspend fun dequeue(id: String)

    /**
     * The number of mutations currently waiting to be pushed.
     */
    suspend fun pendingCount(): Int

    /**
     * Return a snapshot of all pending mutations in FIFO order.
     */
    suspend fun allPending(): List<SyncMutation>
}