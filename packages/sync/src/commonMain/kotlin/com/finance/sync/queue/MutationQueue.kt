// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.queue

import com.finance.sync.SyncMutation
import kotlinx.coroutines.flow.Flow

/**
 * A FIFO queue of [SyncMutation]s awaiting push to the sync backend.
 *
 * Implementations must be safe for concurrent access from multiple coroutines.
 *
 * Provides FIFO ordering guarantees for mutations. Mutations for the same
 * record are coalesced when possible:
 * - INSERT + UPDATE → INSERT with merged data
 * - INSERT + DELETE → both removed (net no-op)
 * - UPDATE + UPDATE → single UPDATE with latest data
 * - UPDATE + DELETE → DELETE
 */
interface MutationQueue {

    // ── Reactive state ──────────────────────────────────────────────────

    /**
     * Number of mutations currently in the queue, as a reactive [Flow].
     *
     * Emits a new value every time the queue size changes.
     */
    val pendingCountFlow: Flow<Int>

    /**
     * Whether the queue has any pending mutations, as a reactive [Flow].
     *
     * Convenience projection of [pendingCountFlow] — emits `true` when the
     * queue is non-empty, `false` when empty.
     */
    val hasPendingMutations: Flow<Boolean>

    // ── Core operations ─────────────────────────────────────────────────

    /**
     * Add a mutation to the tail of the queue.
     *
     * If a mutation for the same [SyncMutation.entityKey] is already enqueued,
     * the implementation coalesces the mutations according to operation-aware
     * rules (see class-level KDoc).
     */
    suspend fun enqueue(mutation: SyncMutation)

    /**
     * Add multiple mutations atomically.
     *
     * Coalescing rules apply to each mutation against the existing queue state
     * and against earlier items in [mutations]. All insertions happen under a
     * single lock acquisition.
     */
    suspend fun enqueueAll(mutations: List<SyncMutation>)

    // ── Peek / query ────────────────────────────────────────────────────

    /**
     * Return the mutation at the head of the queue without removing it,
     * or `null` if the queue is empty.
     */
    suspend fun peek(): SyncMutation?

    /**
     * Peek at the next batch of mutations to process.
     * Does not remove them from the queue.
     *
     * @param limit Maximum number of mutations to return.
     * @return Up to [limit] mutations in FIFO order; empty list if the queue
     *   is empty.
     */
    suspend fun peekBatch(limit: Int = 100): List<SyncMutation>

    /**
     * Return a snapshot of all pending mutations in FIFO order.
     */
    suspend fun allPending(): List<SyncMutation>

    /**
     * Get all mutations for a specific record.
     *
     * Useful for checking if there are pending local changes for a record
     * before applying a pull from the server.
     *
     * @param tableName The table the record belongs to.
     * @param recordId The record's primary-key value (`rowData["id"]`).
     * @return All queued mutations whose [SyncMutation.entityKey] matches
     *   `"$tableName:$recordId"`.
     */
    suspend fun getMutationsForRecord(tableName: String, recordId: String): List<SyncMutation>

    // ── Acknowledge / dequeue ───────────────────────────────────────────

    /**
     * Remove the mutation with the given [id] from the queue.
     * No-op if the ID is not found.
     */
    suspend fun dequeue(id: String)

    /**
     * Remove successfully processed mutations from the queue.
     *
     * This is the batch equivalent of [dequeue] — removes every mutation
     * whose ID appears in [mutationIds] and cleans up associated retry state.
     *
     * @param mutationIds IDs of mutations that were successfully synced.
     */
    suspend fun acknowledge(mutationIds: List<String>)

    // ── Retry / failure tracking ────────────────────────────────────────

    /**
     * Mark mutations as failed, incrementing their internal retry count.
     *
     * Mutations whose retry count reaches a configured maximum can be
     * retrieved via [getDeadLetterMutations].
     *
     * @param mutationIds IDs of mutations that failed on this push attempt.
     */
    suspend fun markFailed(mutationIds: List<String>)

    /**
     * Get mutations that have exceeded the maximum retry threshold.
     *
     * These mutations need manual intervention or will be dropped.
     *
     * @param maxRetries The retry threshold. Mutations with a retry count
     *   **≥** this value are considered dead-lettered.
     * @return Dead-lettered mutations in FIFO order.
     */
    suspend fun getDeadLetterMutations(maxRetries: Int = 5): List<SyncMutation>

    /**
     * Get the current retry count for a mutation.
     *
     * @return The number of times [markFailed] has been called for this
     *   mutation, or `0` if the mutation has never failed (or does not exist).
     */
    suspend fun getRetryCount(mutationId: String): Int

    // ── Count ───────────────────────────────────────────────────────────

    /**
     * The number of mutations currently waiting to be pushed.
     */
    suspend fun pendingCount(): Int

    // ── Administration ──────────────────────────────────────────────────

    /**
     * Remove all mutations and associated retry state from the queue.
     *
     * Use with caution — typically only on user sign-out or full-resync.
     */
    suspend fun clear()
}