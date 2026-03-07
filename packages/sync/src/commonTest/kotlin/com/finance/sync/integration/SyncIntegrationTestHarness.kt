package com.finance.sync.integration

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant

/**
 * Integration-test harness that simulates a two-device sync topology.
 *
 * ```
 *   ┌──────────┐        ┌───────────────┐        ┌──────────┐
 *   │ Device A  │ ◄────► │  MockSyncServer│ ◄────► │ Device B  │
 *   └──────────┘        └───────────────┘        └──────────┘
 * ```
 *
 * Each device has:
 * - An independent [InMemoryDatabase] representing local SQLite.
 * - A dedicated [NetworkSimulator] so connectivity can be controlled per-device.
 * - A [SyncClient] that reads/writes to the local DB and communicates with the
 *   shared [MockSyncServer].
 */
class SyncIntegrationTestHarness {

    val server = MockSyncServer()

    val networkA = NetworkSimulator()
    val networkB = NetworkSimulator()

    val deviceA = SyncClient(clientId = "device-a", database = InMemoryDatabase(), network = networkA, server = server)
    val deviceB = SyncClient(clientId = "device-b", database = InMemoryDatabase(), network = networkB, server = server)

    /** Reset all components to a clean state. */
    suspend fun reset() {
        server.reset()
        networkA.reset()
        networkB.reset()
        deviceA.reset()
        deviceB.reset()
    }
}

// ─── In-Memory Database ─────────────────────────────────────────────

/**
 * Minimal in-memory store that records entities by (type, id).
 *
 * This intentionally does NOT depend on SQLDelight or any real DB driver
 * so that these integration tests run on all KMP targets without native
 * database dependencies.
 */
class InMemoryDatabase {

    private val mutex = Mutex()

    /** Storage: key = "$entityType:$entityId", value = entity record. */
    private val store = mutableMapOf<String, EntityRecord>()

    data class EntityRecord(
        val entityType: String,
        val entityId: String,
        val payload: String,
        val updatedAt: Instant,
        val isDeleted: Boolean = false,
        val syncVersion: Long = 0L,
    )

    suspend fun upsert(record: EntityRecord) = mutex.withLock {
        store[key(record.entityType, record.entityId)] = record
    }

    suspend fun get(entityType: String, entityId: String): EntityRecord? = mutex.withLock {
        store[key(entityType, entityId)]
    }

    suspend fun getAll(entityType: String): List<EntityRecord> = mutex.withLock {
        store.values.filter { it.entityType == entityType }
    }

    suspend fun getAllIncludingDeleted(entityType: String): List<EntityRecord> = mutex.withLock {
        store.values.filter { it.entityType == entityType }
    }

    suspend fun delete(entityType: String, entityId: String) = mutex.withLock {
        val existing = store[key(entityType, entityId)]
        if (existing != null) {
            store[key(entityType, entityId)] = existing.copy(
                isDeleted = true,
                updatedAt = Clock.System.now(),
            )
        }
    }

    /** Return number of records (including soft-deleted). */
    suspend fun size(): Int = mutex.withLock { store.size }

    suspend fun clear() = mutex.withLock { store.clear() }

    private fun key(entityType: String, entityId: String) = "$entityType:$entityId"
}

// ─── Sync Client ────────────────────────────────────────────────────

/**
 * Simulated sync client that:
 * 1. Writes mutations to a local [InMemoryDatabase].
 * 2. Queues mutations for upload via [MockSyncServer].
 * 3. Pulls remote changes and applies them locally (last-writer-wins).
 *
 * All network calls are routed through a [NetworkSimulator] so tests can
 * toggle connectivity per-device.
 */
class SyncClient(
    val clientId: String,
    val database: InMemoryDatabase,
    private val network: NetworkSimulator,
    private val server: MockSyncServer,
) {
    private val mutex = Mutex()

    /** Pending mutations queued while offline. */
    private val _offlineQueue = mutableListOf<SyncMutation>()
    val offlineQueueSize: Int get() = _offlineQueue.size

    /** Last sequence number received from the server. */
    private var lastSyncedSequence: Long = 0L

    /** Backoff state for retry logic. */
    private var currentBackoffMs: Long = BASE_BACKOFF_MS
    private var _backoffCount: Int = 0
    val backoffCount: Int get() = _backoffCount

    // ── Write operations ────────────────────────────────────────

    /**
     * Create or update an entity locally and queue the mutation for sync.
     */
    suspend fun put(
        entityType: String,
        entityId: String,
        payload: String,
        operation: MutationOperation = MutationOperation.INSERT,
    ) {
        val now = Clock.System.now()

        database.upsert(
            InMemoryDatabase.EntityRecord(
                entityType = entityType,
                entityId = entityId,
                payload = payload,
                updatedAt = now,
            ),
        )

        val mutation = SyncMutation(
            clientId = clientId,
            entityType = entityType,
            entityId = entityId,
            operation = operation,
            payload = payload,
            timestamp = now,
        )

        queueOrSend(mutation)
    }

    /**
     * Soft-delete an entity locally and queue the delete mutation.
     */
    suspend fun softDelete(entityType: String, entityId: String) {
        val now = Clock.System.now()
        database.delete(entityType, entityId)

        val mutation = SyncMutation(
            clientId = clientId,
            entityType = entityType,
            entityId = entityId,
            operation = MutationOperation.DELETE,
            payload = "",
            timestamp = now,
        )

        queueOrSend(mutation)
    }

    // ── Sync operations ─────────────────────────────────────────

    /**
     * Push any queued offline mutations to the server.
     *
     * @return number of mutations successfully pushed.
     */
    suspend fun pushPendingMutations(): Int = mutex.withLock {
        if (_offlineQueue.isEmpty()) return 0

        try {
            val toSend = _offlineQueue.toList()
            network.execute {
                server.receiveMutations(toSend)
            }
            val count = toSend.size
            _offlineQueue.clear()
            resetBackoff()
            count
        } catch (_: NetworkOfflineException) {
            0
        } catch (_: ServerErrorException) {
            incrementBackoff()
            0
        }
    }

    /**
     * Pull remote changes from the server and apply them locally.
     *
     * Uses last-writer-wins (LWW) by comparing timestamps: a remote
     * mutation is only applied if its timestamp is newer than the local
     * record's `updatedAt`.
     *
     * @return the list of mutations that were applied.
     */
    suspend fun pullRemoteChanges(): List<SyncMutation> {
        return try {
            val changes = network.execute {
                server.getChanges(sinceSequence = lastSyncedSequence, excludeClientId = clientId)
            }

            val applied = mutableListOf<SyncMutation>()

            for (mutation in changes) {
                val local = database.get(mutation.entityType, mutation.entityId)

                val shouldApply = when {
                    local == null -> true
                    mutation.timestamp > local.updatedAt -> true  // LWW
                    else -> false
                }

                if (shouldApply) {
                    when (mutation.operation) {
                        MutationOperation.DELETE -> database.delete(mutation.entityType, mutation.entityId)
                        else -> database.upsert(
                            InMemoryDatabase.EntityRecord(
                                entityType = mutation.entityType,
                                entityId = mutation.entityId,
                                payload = mutation.payload,
                                updatedAt = mutation.timestamp,
                            ),
                        )
                    }
                    applied.add(mutation)
                }

                if (mutation.sequence > lastSyncedSequence) {
                    lastSyncedSequence = mutation.sequence
                }
            }

            resetBackoff()
            applied
        } catch (_: NetworkOfflineException) {
            emptyList()
        } catch (_: ServerErrorException) {
            incrementBackoff()
            emptyList()
        }
    }

    /**
     * Detect gaps in the sequence numbers received from the server.
     *
     * @return true if a gap was detected (caller should trigger full resync).
     */
    suspend fun detectSequenceGap(): Boolean {
        return try {
            val changes = network.execute {
                server.getChanges(sinceSequence = lastSyncedSequence, excludeClientId = clientId)
            }
            if (changes.isEmpty()) return false

            val expectedStart = lastSyncedSequence + 1
            val sequences = changes.map { it.sequence }.sorted()

            // Check for gap between last synced and first received
            if (sequences.first() > expectedStart) return true

            // Check for gaps within the received set
            for (i in 1 until sequences.size) {
                if (sequences[i] - sequences[i - 1] > 1) return true
            }

            false
        } catch (_: NetworkOfflineException) {
            false
        } catch (_: ServerErrorException) {
            false
        }
    }

    // ── Internal ────────────────────────────────────────────────

    private suspend fun queueOrSend(mutation: SyncMutation) = mutex.withLock {
        try {
            network.execute {
                server.receiveMutation(mutation)
            }
        } catch (_: NetworkOfflineException) {
            _offlineQueue.add(mutation)
        } catch (_: ServerErrorException) {
            _offlineQueue.add(mutation)
            incrementBackoff()
        }
    }

    private fun resetBackoff() {
        currentBackoffMs = BASE_BACKOFF_MS
    }

    private fun incrementBackoff() {
        _backoffCount++
        currentBackoffMs = (currentBackoffMs * 2).coerceAtMost(MAX_BACKOFF_MS)
    }

    /** Reset client state for reuse across tests. */
    suspend fun reset() = mutex.withLock {
        _offlineQueue.clear()
        lastSyncedSequence = 0L
        currentBackoffMs = BASE_BACKOFF_MS
        _backoffCount = 0
        database.clear()
    }

    companion object {
        const val BASE_BACKOFF_MS = 100L
        const val MAX_BACKOFF_MS = 30_000L
    }
}
