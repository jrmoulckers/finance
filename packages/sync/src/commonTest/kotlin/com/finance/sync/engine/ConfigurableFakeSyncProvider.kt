// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.engine

import com.finance.sync.MutationOperation
import com.finance.sync.PullResult
import com.finance.sync.PushFailure
import com.finance.sync.PushResult
import com.finance.sync.SyncChange
import com.finance.sync.SyncConfig
import com.finance.sync.SyncCredentials
import com.finance.sync.SyncMutation
import com.finance.sync.SyncProvider
import com.finance.sync.SyncStatus
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.Instant

/**
 * A configurable fake [SyncProvider] for integration testing the full
 * [com.finance.sync.DefaultSyncEngine] pipeline.
 *
 * Unlike the minimal [com.finance.sync.FakeSyncProvider] in unit tests,
 * this fake supports:
 *
 * - **Pre-loaded server changes** via [addServerChanges] — simulates a
 *   server that has changes waiting to be pulled.
 * - **Per-mutation push tracking** — records every mutation pushed and
 *   returns configurable per-mutation success/failure results.
 * - **Pagination simulation** — can split changes across multiple pull
 *   responses to exercise the pagination loop.
 * - **Selective failure injection** — fail individual operations (connect,
 *   pull, push) or specific mutations.
 * - **Version tracking** — automatically filters server changes based on
 *   `since` versions, simulating real server behaviour.
 *
 * All operations are synchronous and in-memory — no network I/O.
 */
class ConfigurableFakeSyncProvider : SyncProvider {

    // ── Configuration ───────────────────────────────────────────────

    /** When `true`, [connect] throws a [RuntimeException]. */
    var connectShouldFail: Boolean = false

    /** When `true`, [pullChanges] throws a [RuntimeException]. */
    var pullShouldFail: Boolean = false

    /** When `true`, all mutations in [pushMutations] fail as retryable. */
    var pushShouldFail: Boolean = false

    /** Error message used for injected push failures. */
    var pushErrorMessage: String = "Simulated push failure"

    /** When `true`, push failures are marked as retryable. */
    var pushFailureRetryable: Boolean = true

    /** Maximum changes per pull response. `null` means return all at once. */
    var pageSize: Int? = null

    /**
     * Mutation IDs that should fail when pushed.
     * Each entry maps to a [PushFailure] with the provided error and retryability.
     */
    val failingMutationIds: MutableMap<String, Pair<String, Boolean>> = mutableMapOf()

    // ── Recorded interactions ────────────────────────────────────────

    /** Number of times [connect] was called successfully. */
    var connectCount: Int = 0
        private set

    /** Number of times [disconnect] was called. */
    var disconnectCount: Int = 0
        private set

    /** All mutations received via [pushMutations], in order. */
    val pushedMutations: MutableList<SyncMutation> = mutableListOf()

    /** Number of pull requests made. */
    var pullCount: Int = 0
        private set

    // ── Server state ────────────────────────────────────────────────

    /**
     * Server-side changes, indexed by table name for efficient filtering.
     * Each change has a `syncVersion` that is compared against `since` versions.
     */
    private val serverChanges: MutableList<SyncChange> = mutableListOf()

    /** Versions that have already been delivered to the client. */
    private val deliveredVersions: MutableMap<String, Long> = mutableMapOf()

    private val _status = MutableStateFlow<SyncStatus>(SyncStatus.Idle)

    // ── Setup helpers ───────────────────────────────────────────────

    /**
     * Add server changes that will be returned by [pullChanges].
     *
     * Changes are filtered by their `syncVersion` against the `since`
     * parameter — only changes with `syncVersion > since[tableName]`
     * are returned.
     */
    fun addServerChanges(changes: List<SyncChange>) {
        serverChanges.addAll(changes)
    }

    /**
     * Convenience: add a single server change.
     */
    fun addServerChange(change: SyncChange) {
        serverChanges.add(change)
    }

    /** Clear all server-side changes. */
    fun clearServerChanges() {
        serverChanges.clear()
        deliveredVersions.clear()
    }

    /** Reset all state and counters. */
    fun reset() {
        connectShouldFail = false
        pullShouldFail = false
        pushShouldFail = false
        pushErrorMessage = "Simulated push failure"
        pushFailureRetryable = true
        pageSize = null
        failingMutationIds.clear()
        connectCount = 0
        disconnectCount = 0
        pushedMutations.clear()
        pullCount = 0
        serverChanges.clear()
        deliveredVersions.clear()
        _status.value = SyncStatus.Idle
    }

    // ── SyncProvider implementation ─────────────────────────────────

    override suspend fun initialize(config: SyncConfig) {
        // No-op for in-memory fake.
    }

    override suspend fun connect(credentials: SyncCredentials, config: SyncConfig) {
        if (connectShouldFail) {
            throw RuntimeException("Simulated connect failure")
        }
        connectCount++
        _status.value = SyncStatus.Connected
    }

    override suspend fun disconnect() {
        disconnectCount++
        _status.value = SyncStatus.Disconnected
    }

    override suspend fun push(mutations: List<SyncMutation>): Result<Unit> {
        val result = pushMutations(mutations)
        return if (result.isFullySuccessful) {
            Result.success(Unit)
        } else {
            val errors = result.failed.joinToString("; ") { it.error }
            Result.failure(RuntimeException(errors))
        }
    }

    override fun pull(): Flow<List<SyncChange>> = _status.let {
        // Not used by DeltaSyncManager — pullChanges is used instead.
        kotlinx.coroutines.flow.emptyFlow()
    }

    override fun getStatus(): Flow<SyncStatus> = _status.asStateFlow()

    /**
     * Return server changes filtered by the `since` versions.
     *
     * Simulates real server behaviour:
     * 1. Filter changes where `syncVersion > since[tableName]`.
     * 2. Sort by sequence number.
     * 3. If [pageSize] is set, return at most that many changes and set `hasMore`.
     * 4. Track delivered versions to support paginated pulls.
     */
    override suspend fun pullChanges(since: Map<String, Long>): PullResult {
        pullCount++

        if (pullShouldFail) {
            throw RuntimeException("Simulated pull failure")
        }

        // Merge caller's versions with our tracking of what was already delivered
        val effectiveVersions = buildMap {
            putAll(since)
            for ((table, version) in deliveredVersions) {
                val current = get(table) ?: 0L
                if (version > current) {
                    put(table, version)
                }
            }
        }

        // Filter changes newer than the effective versions
        val eligible = serverChanges.filter { change ->
            val sinceVersion = effectiveVersions[change.tableName] ?: 0L
            change.syncVersion > sinceVersion
        }.sortedBy { it.sequenceNumber }

        // Apply pagination
        val limit = pageSize
        val batch = if (limit != null && eligible.size > limit) {
            eligible.take(limit)
        } else {
            eligible
        }
        val hasMore = limit != null && eligible.size > limit

        // Compute new versions from the batch
        val newVersions = buildMap<String, Long> {
            putAll(effectiveVersions)
            for (change in batch) {
                val current = get(change.tableName) ?: 0L
                if (change.syncVersion > current) {
                    put(change.tableName, change.syncVersion)
                }
            }
        }

        // Track delivered versions for pagination
        deliveredVersions.putAll(newVersions)

        return PullResult(
            changes = batch,
            newVersions = newVersions,
            hasMore = hasMore,
        )
    }

    /**
     * Record pushed mutations and return per-mutation results.
     *
     * - If [pushShouldFail] is `true`, all mutations fail.
     * - If a mutation's ID is in [failingMutationIds], that mutation fails
     *   with the configured error; others succeed.
     * - Otherwise, all mutations succeed.
     */
    override suspend fun pushMutations(mutations: List<SyncMutation>): PushResult {
        pushedMutations.addAll(mutations)

        if (pushShouldFail) {
            return PushResult(
                succeeded = emptyList(),
                failed = mutations.map { m ->
                    PushFailure(
                        mutationId = m.id,
                        error = pushErrorMessage,
                        retryable = pushFailureRetryable,
                    )
                },
            )
        }

        val succeeded = mutableListOf<String>()
        val failed = mutableListOf<PushFailure>()

        for (mutation in mutations) {
            val failConfig = failingMutationIds[mutation.id]
            if (failConfig != null) {
                failed.add(
                    PushFailure(
                        mutationId = mutation.id,
                        error = failConfig.first,
                        retryable = failConfig.second,
                    ),
                )
            } else {
                succeeded.add(mutation.id)
            }
        }

        return PushResult(succeeded = succeeded, failed = failed)
    }
}

// ── Test data builders ──────────────────────────────────────────────

/**
 * Convenience builder for creating test [SyncChange] instances.
 */
fun testSyncChange(
    tableName: String = "transactions",
    operation: MutationOperation = MutationOperation.INSERT,
    rowData: Map<String, String?> = mapOf("id" to "row-1", "amount" to "1000"),
    serverTimestamp: Instant = Instant.fromEpochMilliseconds(1_700_000_000_000L),
    sequenceNumber: Long = 1L,
    recordId: String = rowData["id"] ?: "",
    syncVersion: Long = 1L,
    householdId: String = "household-1",
): SyncChange = SyncChange(
    tableName = tableName,
    operation = operation,
    rowData = rowData,
    serverTimestamp = serverTimestamp,
    sequenceNumber = sequenceNumber,
    recordId = recordId,
    syncVersion = syncVersion,
    householdId = householdId,
)

/**
 * Convenience builder for creating test [SyncMutation] instances.
 */
fun testSyncMutation(
    id: String = "mut-1",
    tableName: String = "transactions",
    operation: MutationOperation = MutationOperation.INSERT,
    rowData: Map<String, String?> = mapOf("id" to "row-1", "amount" to "1000"),
    timestamp: Instant = Instant.fromEpochMilliseconds(1_700_000_000_000L),
    recordId: String = rowData["id"] ?: "",
    householdId: String = "household-1",
): SyncMutation = SyncMutation(
    id = id,
    tableName = tableName,
    operation = operation,
    rowData = rowData,
    timestamp = timestamp,
    recordId = recordId,
    householdId = householdId,
)
