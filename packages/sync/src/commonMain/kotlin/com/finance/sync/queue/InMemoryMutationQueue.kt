package com.finance.sync.queue

import com.finance.sync.SyncMutation
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Thread-safe, in-memory implementation of [MutationQueue].
 *
 * Uses a [Mutex] for coroutine-safe access -- no platform-specific concurrency
 * primitives required.
 *
 * When a mutation with a duplicate [SyncMutation.entityKey] is enqueued,
 * the older mutation is replaced with the newer one (latest mutation wins).
 */
class InMemoryMutationQueue : MutationQueue {

    private val mutex = Mutex()

    /**
     * Insertion-ordered map of mutation ID -> mutation.
     * LinkedHashMap preserves insertion order for FIFO semantics.
     */
    private val queue = LinkedHashMap<String, SyncMutation>()

    /**
     * Reverse index: entity key -> mutation ID.
     * Used for O(1) deduplication lookups.
     */
    private val entityIndex = mutableMapOf<String, String>()

    override suspend fun enqueue(mutation: SyncMutation) = mutex.withLock {
        // Deduplicate: if a mutation for the same entity already exists, remove it.
        val existingId = entityIndex[mutation.entityKey]
        if (existingId != null) {
            queue.remove(existingId)
        }

        queue[mutation.id] = mutation
        entityIndex[mutation.entityKey] = mutation.id
    }

    override suspend fun peek(): SyncMutation? = mutex.withLock {
        queue.values.firstOrNull()
    }

    override suspend fun dequeue(id: String) = mutex.withLock {
        val removed = queue.remove(id)
        if (removed != null) {
            entityIndex.remove(removed.entityKey)
        }
    }

    override suspend fun pendingCount(): Int = mutex.withLock {
        queue.size
    }

    override suspend fun allPending(): List<SyncMutation> = mutex.withLock {
        queue.values.toList()
    }
}