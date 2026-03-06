package com.finance.sync.integration

import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.datetime.Instant

/**
 * In-memory mock sync server that relays mutations between simulated clients.
 *
 * Each mutation is stamped with a monotonically increasing sequence number.
 * Clients poll for changes by providing their last-seen sequence, and the
 * server returns all mutations with a higher sequence number, excluding
 * those originating from the requesting client.
 *
 * Supports:
 * - Configurable response latency
 * - Failure injection (server errors)
 * - Sequence-gap simulation for resync testing
 */
class MockSyncServer {

    private val mutex = Mutex()

    /** Monotonically increasing sequence counter. */
    private var nextSequence: Long = 1L

    /** All mutations received, ordered by sequence. */
    private val _mutations = mutableListOf<SyncMutation>()
    val mutations: List<SyncMutation> get() = _mutations.toList()

    /** Configurable latency injected before each response. */
    @Volatile
    var responseLatencyMs: Long = 0L

    /** When true, the next server call throws [ServerErrorException]. */
    @Volatile
    var shouldFailNext: Boolean = false

    /** Counter tracking how many times a failure was triggered. */
    @Volatile
    var failureCount: Int = 0
        private set

    /** Sequences to skip, used to simulate gaps that trigger resync. */
    private val skippedSequences = mutableSetOf<Long>()

    // ── Mutation reception ──────────────────────────────────────────

    /**
     * Receive a mutation from a client, assign a sequence number, and store it.
     *
     * @return the assigned sequence number.
     */
    suspend fun receiveMutation(mutation: SyncMutation): Long = mutex.withLock {
        injectLatency()
        injectFailure()

        val seq = nextSequence++
        _mutations.add(mutation.copy(sequence = seq))
        seq
    }

    /**
     * Receive a batch of mutations from a client.
     *
     * @return the list of assigned sequence numbers.
     */
    suspend fun receiveMutations(mutations: List<SyncMutation>): List<Long> {
        return mutations.map { receiveMutation(it) }
    }

    // ── Change distribution ─────────────────────────────────────────

    /**
     * Return all mutations with a sequence greater than [sinceSequence],
     * excluding those originating from [excludeClientId].
     *
     * Mutations whose sequence is in [skippedSequences] are omitted to
     * simulate gaps that should trigger a full resync.
     */
    suspend fun getChanges(
        sinceSequence: Long,
        excludeClientId: String,
    ): List<SyncMutation> = mutex.withLock {
        injectLatency()
        injectFailure()

        _mutations.filter { m ->
            m.sequence > sinceSequence &&
                m.clientId != excludeClientId &&
                m.sequence !in skippedSequences
        }
    }

    /** Return the highest sequence number currently stored. */
    suspend fun getLatestSequence(): Long = mutex.withLock {
        if (_mutations.isEmpty()) 0L else _mutations.last().sequence
    }

    // ── Failure injection ───────────────────────────────────────────

    /**
     * Configure a sequence gap: the server will omit this sequence number
     * from [getChanges] results, forcing clients to detect the gap and
     * trigger a full resync.
     */
    suspend fun addSequenceGap(sequence: Long) = mutex.withLock {
        skippedSequences.add(sequence)
    }

    /** Clear all injected sequence gaps. */
    suspend fun clearSequenceGaps() = mutex.withLock {
        skippedSequences.clear()
    }

    // ── Helpers ─────────────────────────────────────────────────────

    /** Reset the server to a clean initial state. */
    suspend fun reset() = mutex.withLock {
        nextSequence = 1L
        _mutations.clear()
        responseLatencyMs = 0L
        shouldFailNext = false
        failureCount = 0
        skippedSequences.clear()
    }

    private suspend fun injectLatency() {
        if (responseLatencyMs > 0) delay(responseLatencyMs)
    }

    private fun injectFailure() {
        if (shouldFailNext) {
            shouldFailNext = false
            failureCount++
            throw ServerErrorException("Simulated server error (failure #$failureCount)")
        }
    }
}

/** Thrown when the mock server simulates a 500-class error. */
class ServerErrorException(message: String) : Exception(message)

// ── Data types ──────────────────────────────────────────────────────

/**
 * Represents a single sync mutation sent by a client.
 *
 * @property clientId   Identifier of the originating client/device.
 * @property entityType The entity table being mutated (e.g. "transaction", "account").
 * @property entityId   The ID of the entity being mutated.
 * @property operation  The mutation operation.
 * @property payload    Serialised JSON payload of the entity state.
 * @property timestamp  Client-side wall-clock time of the mutation.
 * @property sequence   Server-assigned sequence number (0 until assigned).
 */
data class SyncMutation(
    val clientId: String,
    val entityType: String,
    val entityId: String,
    val operation: MutationOperation,
    val payload: String,
    val timestamp: Instant,
    val sequence: Long = 0L,
)

enum class MutationOperation { INSERT, UPDATE, DELETE }
