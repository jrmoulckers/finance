// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.queue

import com.finance.sync.MutationOperation
import com.finance.sync.SyncMutation
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Thread-safe, in-memory implementation of [MutationQueue].
 *
 * Uses a [Mutex] for coroutine-safe access — no platform-specific concurrency
 * primitives required.
 *
 * Supports operation-aware coalescing when a mutation for the same
 * [SyncMutation.entityKey] is already in the queue:
 *
 * | Existing | Incoming | Result                                   |
 * |----------|----------|------------------------------------------|
 * | INSERT   | UPDATE   | INSERT with merged `rowData`              |
 * | INSERT   | DELETE   | **Both removed** (net no-op)              |
 * | UPDATE   | UPDATE   | Single UPDATE with latest `rowData`       |
 * | UPDATE   | DELETE   | DELETE                                    |
 * | DELETE   | INSERT   | INSERT (re-creation)                      |
 * | *other*  | *any*    | Latest mutation wins                      |
 *
 * Note: This implementation does **not** persist across app restarts.
 * For production use, a persistent implementation backed by SQLite (via
 * SQLDelight) should be used.
 */
class InMemoryMutationQueue : MutationQueue {

    private val mutex = Mutex()

    /**
     * Insertion-ordered map of mutation ID → mutation.
     * [LinkedHashMap] preserves insertion order for FIFO semantics.
     */
    private val queue = LinkedHashMap<String, SyncMutation>()

    /**
     * Reverse index: entity key → mutation ID.
     * Used for O(1) deduplication / coalescing lookups.
     */
    private val entityIndex = mutableMapOf<String, String>()

    /**
     * Retry-count tracker: mutation ID → number of failed push attempts.
     * Tracked separately from [SyncMutation] so the data class stays immutable
     * and free of queue-management concerns.
     */
    private val retryCounts = mutableMapOf<String, Int>()

    private val _pendingCount = MutableStateFlow(0)

    // ── Reactive state ──────────────────────────────────────────────────

    override val pendingCountFlow: Flow<Int>
        get() = _pendingCount

    override val hasPendingMutations: Flow<Boolean>
        get() = _pendingCount.map { it > 0 }

    // ── Core operations ─────────────────────────────────────────────────

    override suspend fun enqueue(mutation: SyncMutation): Unit = mutex.withLock {
        enqueueInternal(mutation)
        _pendingCount.value = queue.size
    }

    override suspend fun enqueueAll(mutations: List<SyncMutation>): Unit = mutex.withLock {
        for (mutation in mutations) {
            enqueueInternal(mutation)
        }
        _pendingCount.value = queue.size
    }

    // ── Peek / query ────────────────────────────────────────────────────

    override suspend fun peek(): SyncMutation? = mutex.withLock {
        queue.values.firstOrNull()
    }

    override suspend fun peekBatch(limit: Int): List<SyncMutation> = mutex.withLock {
        require(limit > 0) { "Limit must be positive, got $limit" }
        queue.values.take(limit)
    }

    override suspend fun allPending(): List<SyncMutation> = mutex.withLock {
        queue.values.toList()
    }

    override suspend fun getMutationsForRecord(
        tableName: String,
        recordId: String,
    ): List<SyncMutation> = mutex.withLock {
        val targetKey = "$tableName:$recordId"
        queue.values.filter { it.entityKey == targetKey }
    }

    // ── Acknowledge / dequeue ───────────────────────────────────────────

    override suspend fun dequeue(id: String): Unit = mutex.withLock {
        removeInternal(id)
        _pendingCount.value = queue.size
    }

    override suspend fun acknowledge(mutationIds: List<String>): Unit = mutex.withLock {
        for (id in mutationIds) {
            removeInternal(id)
        }
        _pendingCount.value = queue.size
    }

    // ── Retry / failure tracking ────────────────────────────────────────

    override suspend fun markFailed(mutationIds: List<String>): Unit = mutex.withLock {
        for (id in mutationIds) {
            if (queue.containsKey(id)) {
                retryCounts[id] = (retryCounts[id] ?: 0) + 1
            }
        }
    }

    override suspend fun getDeadLetterMutations(maxRetries: Int): List<SyncMutation> = mutex.withLock {
        require(maxRetries > 0) { "maxRetries must be positive, got $maxRetries" }
        queue.values.filter { mutation ->
            (retryCounts[mutation.id] ?: 0) >= maxRetries
        }
    }

    override suspend fun getRetryCount(mutationId: String): Int = mutex.withLock {
        retryCounts[mutationId] ?: 0
    }

    // ── Count ───────────────────────────────────────────────────────────

    override suspend fun pendingCount(): Int = mutex.withLock {
        queue.size
    }

    // ── Administration ──────────────────────────────────────────────────

    override suspend fun clear(): Unit = mutex.withLock {
        queue.clear()
        entityIndex.clear()
        retryCounts.clear()
        _pendingCount.value = 0
    }

    // ── Internal helpers ────────────────────────────────────────────────

    /**
     * Enqueue a single mutation with operation-aware coalescing.
     * **Must** be called while holding [mutex].
     */
    private fun enqueueInternal(mutation: SyncMutation) {
        val existingId = entityIndex[mutation.entityKey]
        if (existingId != null) {
            val existing = queue[existingId]
            if (existing != null) {
                val coalesced = coalesce(existing, mutation)

                // Remove the old entry regardless of coalescing outcome.
                queue.remove(existingId)
                entityIndex.remove(existing.entityKey)
                retryCounts.remove(existingId)

                if (coalesced != null) {
                    // Re-insert at the tail so it gets the latest FIFO position.
                    queue[coalesced.id] = coalesced
                    entityIndex[coalesced.entityKey] = coalesced.id
                }
                // coalesced == null → INSERT + DELETE cancelled each other out.
                return
            }
        }

        // No prior mutation for this entity key — append to tail.
        queue[mutation.id] = mutation
        entityIndex[mutation.entityKey] = mutation.id
    }

    /**
     * Remove a single mutation by ID and clean up associated indexes.
     * **Must** be called while holding [mutex].
     */
    private fun removeInternal(id: String) {
        val removed = queue.remove(id)
        if (removed != null) {
            entityIndex.remove(removed.entityKey)
        }
        retryCounts.remove(id)
    }

    /**
     * Determine the result of coalescing two mutations that target the same
     * entity key.
     *
     * @return The coalesced mutation, or `null` if the two mutations cancel
     *   each other out (INSERT + DELETE → no-op).
     */
    private fun coalesce(existing: SyncMutation, incoming: SyncMutation): SyncMutation? {
        return when (existing.operation) {
            MutationOperation.INSERT -> when (incoming.operation) {
                // Duplicate INSERT — shouldn't normally happen; latest wins.
                MutationOperation.INSERT -> incoming

                // INSERT + UPDATE → INSERT with merged data.
                // The record hasn't been synced yet, so the server still needs
                // an INSERT — but with the latest field values.
                MutationOperation.UPDATE -> existing.copy(
                    id = incoming.id,
                    rowData = existing.rowData + incoming.rowData,
                    timestamp = incoming.timestamp,
                )

                // INSERT + DELETE → net no-op. The record was created locally
                // and deleted before syncing — nothing to push.
                MutationOperation.DELETE -> null
            }

            MutationOperation.UPDATE -> when (incoming.operation) {
                // UPDATE + INSERT — unusual but possible after conflict
                // resolution; treat the INSERT as authoritative.
                MutationOperation.INSERT -> incoming

                // UPDATE + UPDATE → single UPDATE with latest data.
                MutationOperation.UPDATE -> incoming

                // UPDATE + DELETE → DELETE supersedes the UPDATE.
                MutationOperation.DELETE -> incoming
            }

            MutationOperation.DELETE -> when (incoming.operation) {
                // DELETE + INSERT → re-creation; treat as INSERT.
                MutationOperation.INSERT -> incoming

                // DELETE + UPDATE — unusual; latest wins.
                MutationOperation.UPDATE -> incoming

                // DELETE + DELETE → idempotent.
                MutationOperation.DELETE -> incoming
            }
        }
    }
}