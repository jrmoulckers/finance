// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

/**
 * Abstraction over the sync backend (PowerSync initially, but swappable).
 *
 * Platform-specific or third-party SDK code should live behind an `actual`
 * implementation of this interface so the rest of the sync module stays
 * backend-agnostic.
 */
interface SyncProvider {

    /**
     * One-time initialisation. Called before any push/pull operations.
     * Implementations should set up internal state, open local databases, etc.
     */
    suspend fun initialize(config: SyncConfig)

    /**
     * Push a batch of local mutations to the sync backend.
     *
     * @return [Result.success] when all mutations were accepted, or
     *   [Result.failure] with the underlying error on partial/full failure.
     */
    suspend fun push(mutations: List<SyncMutation>): Result<Unit>

    /**
     * Returns a cold [Flow] of changes pulled from the sync backend.
     * Each emission is a batch of changes received in one pull cycle.
     */
    fun pull(): Flow<List<SyncChange>>

    /**
     * Observe the sync provider's status in real time.
     */
    fun getStatus(): Flow<SyncStatus>

    // ── Extended API ──────────────────────────────────────────────

    /**
     * Establish a connection to the sync backend using the given [credentials].
     *
     * This is an alternative to [initialize] that also handles authentication.
     * Default implementation delegates to [initialize] using the [config].
     *
     * @param credentials Credentials for authenticating the sync session.
     * @param config Sync configuration including endpoint and operational parameters.
     */
    suspend fun connect(credentials: SyncCredentials, config: SyncConfig) {
        initialize(config)
    }

    /**
     * Disconnect from the sync backend and release resources.
     *
     * Default implementation is a no-op; override for providers that
     * maintain persistent connections.
     */
    suspend fun disconnect() {
        // No-op by default.
    }

    /**
     * Push a batch of local mutations with structured result reporting.
     *
     * Unlike [push], this returns a [PushResult] with per-mutation success/failure
     * details. Default implementation delegates to [push] and reports all mutations
     * as succeeded or all as failed.
     *
     * @param mutations The mutations to push.
     * @return A [PushResult] with per-mutation outcomes.
     */
    suspend fun pushMutations(mutations: List<SyncMutation>): PushResult {
        return try {
            push(mutations).getOrThrow()
            PushResult(
                succeeded = mutations.map { it.id },
                failed = emptyList(),
            )
        } catch (e: Exception) {
            PushResult(
                succeeded = emptyList(),
                failed = mutations.map { m ->
                    PushFailure(
                        mutationId = m.id,
                        error = e.message ?: "Unknown push error",
                        retryable = true,
                    )
                },
            )
        }
    }

    /**
     * Pull changes from the sync backend since the given version markers.
     *
     * @param since A map of table name → last known sync version. The server
     *   returns only changes newer than these versions.
     * @return A [PullResult] containing the changes and updated version markers.
     */
    suspend fun pullChanges(since: Map<String, Long>): PullResult {
        return PullResult(
            changes = emptyList(),
            newVersions = since,
            hasMore = false,
        )
    }

    /**
     * Observe the sync provider's status as a [Flow].
     *
     * Default implementation delegates to [getStatus].
     */
    fun observeStatus(): Flow<SyncStatus> = getStatus()
}

// ── Result types ────────────────────────────────────────────────────

/**
 * Outcome of pushing a batch of mutations to the sync backend.
 *
 * @property succeeded Mutation IDs that were accepted by the server.
 * @property failed Mutations that failed, with per-mutation error details.
 */
data class PushResult(
    val succeeded: List<String>,
    val failed: List<PushFailure>,
) {
    /** `true` when every mutation in the batch succeeded. */
    val isFullySuccessful: Boolean get() = failed.isEmpty()
}

/**
 * Details about a single mutation that failed during push.
 *
 * @property mutationId The ID of the failed mutation.
 * @property error Human-readable error description.
 * @property retryable `true` if the failure is transient and the mutation
 *   should be retried (e.g. timeout, 503). `false` for permanent failures
 *   (e.g. constraint violation, 400).
 */
data class PushFailure(
    val mutationId: String,
    val error: String,
    val retryable: Boolean,
)

/**
 * Outcome of pulling changes from the sync backend.
 *
 * @property changes The list of changes received in this pull batch.
 * @property newVersions Updated version markers per table. Callers should
 *   persist these and pass them back on the next [SyncProvider.pullChanges] call.
 * @property hasMore `true` when the server has additional changes beyond
 *   this batch (pagination). The caller should issue another pull.
 */
data class PullResult(
    val changes: List<SyncChange>,
    val newVersions: Map<String, Long>,
    val hasMore: Boolean,
)
