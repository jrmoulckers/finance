// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync

import com.finance.sync.conflict.ConflictResolution
import com.finance.sync.conflict.ConflictResolver
import com.finance.sync.conflict.ConflictStrategy
import com.finance.sync.conflict.SyncConflict
import com.finance.sync.delta.DeltaSyncManager
import com.finance.sync.queue.MutationQueue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.supervisorScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.datetime.Clock
import kotlin.math.min
import kotlin.math.pow

/**
 * Main entry point for the Finance sync subsystem.
 *
 * Coordinates connection lifecycle, push/pull cycles, and status reporting.
 * All implementations must be safe to call from any coroutine context.
 */
interface SyncEngine {

    /**
     * Establish a sync session using the given [credentials].
     * Calling `connect` while already connected is a no-op.
     */
    suspend fun connect(credentials: SyncCredentials)

    /**
     * Tear down the current sync session and release resources.
     * Calling `disconnect` while already disconnected is a no-op.
     */
    suspend fun disconnect()

    /**
     * Start a continuous sync loop.
     *
     * Returns a cold [Flow] that emits [SyncStatus] updates for the lifetime
     * of the sync session. The flow completes when [disconnect] is called or
     * an unrecoverable error occurs.
     */
    fun sync(): Flow<SyncStatus>

    /**
     * Observable connection state. `true` when the engine has an active,
     * healthy connection to the sync backend.
     */
    val isConnected: StateFlow<Boolean>
}

// ── Sync result ─────────────────────────────────────────────────────

/**
 * Outcome of a single sync cycle (pull → resolve → push).
 */
sealed class SyncResult {

    /**
     * The sync cycle completed successfully.
     *
     * @property changesApplied Number of remote changes applied locally.
     * @property mutationsPushed Number of local mutations pushed to the server.
     * @property conflictsResolved Number of conflicts that were auto-resolved.
     * @property durationMs Wall-clock duration of the sync cycle in milliseconds.
     */
    data class Success(
        val changesApplied: Int,
        val mutationsPushed: Int,
        val conflictsResolved: Int,
        val durationMs: Long,
    ) : SyncResult()

    /**
     * The sync cycle failed.
     *
     * @property error Structured error describing the failure.
     */
    data class Failure(val error: SyncError) : SyncResult()
}

// ── Health monitoring ───────────────────────────────────────────────

/**
 * Callback interface for health monitoring integration.
 *
 * Allows the sync engine to report lifecycle metrics to an external
 * monitor (e.g., `SyncHealthMonitor` in `packages/core`) without
 * creating a compile-time dependency between the packages.
 *
 * All methods are called on the sync engine's coroutine context.
 * Implementations must be fast and non-blocking.
 */
interface SyncHealthListener {

    /**
     * Called after a sync cycle completes successfully.
     *
     * @param durationMs Wall-clock duration of the sync cycle in milliseconds.
     * @param pendingMutations Number of mutations still pending after the cycle.
     */
    fun onSyncSuccess(durationMs: Long, pendingMutations: Int)

    /**
     * Called after a sync cycle fails.
     *
     * @param error The structured sync error describing the failure.
     */
    fun onSyncFailure(error: SyncError)

    /**
     * Called when the pending mutation count changes.
     *
     * @param count Current number of pending mutations.
     */
    fun onPendingMutationsChanged(count: Int)
}

// ── Default implementation ──────────────────────────────────────────

/**
 * Default [SyncEngine] implementation that orchestrates the full sync lifecycle.
 *
 * Coordinates:
 * 1. **Pull** — fetch remote changes via [SyncProvider.pullChanges] and validate
 *    them through [DeltaSyncManager].
 * 2. **Conflict resolution** — detect conflicts between pulled changes and
 *    pending local mutations, resolving via [ConflictResolver].
 * 3. **Push** — drain the [MutationQueue] by pushing mutations through the provider.
 *
 * The engine runs a periodic sync loop (configurable via [SyncConfig.syncIntervalMs])
 * and supports on-demand sync via [syncNow]. All state is exposed through
 * the reactive [status] flow.
 *
 * @param config Sync configuration including endpoint, intervals, and retry policy.
 * @param provider The sync backend abstraction.
 * @param conflictResolver Resolver for handling conflicts between local and remote changes.
 * @param mutationQueue Queue of pending local mutations to push.
 * @param deltaSyncManager Manager for incremental (delta) sync with sequence tracking.
 * @param clock Time source (injectable for deterministic testing).
 * @param healthListener Optional callback for reporting sync metrics to an external health
 *   monitor. When `null`, health events are silently discarded.
 * @param credentialRefresher Optional suspend function that returns fresh [SyncCredentials].
 *   Called before each sync cycle when the current credentials are
 *   [SyncCredentials.isExpiringSoon]. When `null`, no proactive refresh is attempted.
 */
class DefaultSyncEngine(
    private val config: SyncConfig,
    private val provider: SyncProvider,
    private val conflictResolver: ConflictResolver = ConflictStrategy.LAST_WRITE_WINS.resolver,
    private val mutationQueue: MutationQueue,
    private val deltaSyncManager: DeltaSyncManager,
    private val clock: Clock = Clock.System,
    private val healthListener: SyncHealthListener? = null,
    private val credentialRefresher: (suspend () -> SyncCredentials)? = null,
) : SyncEngine {

    private val _status = MutableStateFlow<SyncStatus>(SyncStatus.Idle)

    /** Observable status of the sync engine. */
    val status: StateFlow<SyncStatus> = _status.asStateFlow()

    private val _isConnected = MutableStateFlow(false)
    override val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private var syncJob: Job? = null
    private var credentials: SyncCredentials? = null
    private var consecutiveFailures: Int = 0

    /**
     * Mutex preventing concurrent [syncNow] cycles. Ensures that only
     * one pull → resolve → push cycle runs at a time, even if [syncNow]
     * is called while the periodic loop is mid-cycle.
     */
    private val syncMutex = Mutex()

    override suspend fun connect(credentials: SyncCredentials) {
        if (_isConnected.value) return

        _status.value = SyncStatus.Connecting
        this.credentials = credentials

        try {
            provider.connect(credentials, config)
            _isConnected.value = true
            _status.value = SyncStatus.Connected
            consecutiveFailures = 0
        } catch (e: Exception) {
            _isConnected.value = false
            _status.value = SyncStatus.Error(
                SyncError.NetworkError(e.message ?: "Connection failed"),
            )
        }
    }

    override suspend fun disconnect() {
        if (!_isConnected.value && syncJob == null) return

        syncJob?.cancel()
        syncJob = null

        try {
            provider.disconnect()
        } catch (_: Exception) {
            // Best-effort disconnect; swallow errors.
        }

        _isConnected.value = false
        credentials = null
        _status.value = SyncStatus.Disconnected
    }

    override fun sync(): Flow<SyncStatus> = _status

    /**
     * Start the sync engine: connect with the given [credentials] and begin
     * a periodic sync loop.
     *
     * The sync loop runs within a [supervisorScope] so that individual sync
     * cycle failures do not cancel the loop — errors are captured and
     * reported via [status] and [healthListener]. The function suspends
     * until [stop] is called or the caller's coroutine scope is cancelled.
     *
     * @param credentials Authentication credentials for the sync backend.
     */
    suspend fun start(credentials: SyncCredentials) {
        connect(credentials)
        if (!_isConnected.value) return

        supervisorScope {
            syncJob = launch {
                while (isActive) {
                    syncNow()
                    delay(config.syncIntervalMs)
                }
            }
        }
    }

    /**
     * Stop the sync engine gracefully.
     *
     * 1. Cancels the periodic sync loop.
     * 2. Waits for any in-flight sync cycle to complete (via [syncMutex]).
     * 3. Disconnects from the sync backend.
     *
     * Safe to call multiple times; subsequent calls are no-ops.
     */
    suspend fun stop() {
        syncJob?.cancel()
        syncJob = null

        // Wait for any in-flight sync cycle to finish before disconnecting.
        syncMutex.withLock { /* barrier — ensures the active cycle completes */ }

        disconnect()
    }

    /**
     * Execute a single sync cycle immediately: pull → resolve conflicts → push.
     *
     * Can be called while the periodic loop is running to force an immediate
     * sync, or standalone for manual sync control. Concurrent calls are
     * serialised by [syncMutex] — only one cycle runs at a time.
     *
     * Before each cycle the engine checks whether the current credentials
     * are close to expiry and, if a [credentialRefresher] was provided,
     * obtains fresh credentials and reconnects transparently.
     *
     * @return A [SyncResult] describing the outcome of the cycle.
     */
    suspend fun syncNow(): SyncResult = syncMutex.withLock {
        val startMs = clock.now().toEpochMilliseconds()

        try {
            // ── Phase 0: Credential Refresh ─────────────────────
            refreshCredentialsIfNeeded()

            // ── Phase 1: Pull + Conflict Detection ──────────────
            _status.value = SyncStatus.Syncing(
                SyncProgress(
                    phase = SyncPhase.PULLING,
                    processedRecords = 0,
                    totalRecords = null,
                ),
            )

            val pendingMutations = mutationQueue.allPending()
            healthListener?.onPendingMutationsChanged(pendingMutations.size)

            val pullCycleResult = deltaSyncManager.executePullCycle(pendingMutations)
            val changes = pullCycleResult.changes

            // Validate pulled changes for sequence continuity & checksums
            if (changes.isNotEmpty()) {
                deltaSyncManager.processChanges(changes)
            }

            // ── Phase 2: Conflict Resolution ────────────────────
            var conflictsResolved = 0

            if (pullCycleResult.conflicts.isNotEmpty()) {
                _status.value = SyncStatus.Syncing(
                    SyncProgress(
                        phase = SyncPhase.RESOLVING_CONFLICTS,
                        processedRecords = 0,
                        totalRecords = null,
                    ),
                )

                conflictsResolved = resolveDetectedConflicts(
                    pullCycleResult.conflicts,
                    pendingMutations,
                )
            }

            // ── Phase 3: Push ───────────────────────────────────
            val currentPending = mutationQueue.allPending()
            var mutationsPushed = 0

            if (currentPending.isNotEmpty()) {
                _status.value = SyncStatus.Syncing(
                    SyncProgress(
                        phase = SyncPhase.PUSHING,
                        processedRecords = 0,
                        totalRecords = currentPending.size,
                    ),
                )

                val pushResult = deltaSyncManager.pushMutations(currentPending)

                for (succeededId in pushResult.succeeded) {
                    mutationQueue.dequeue(succeededId)
                    mutationsPushed++
                }

                _status.value = SyncStatus.Syncing(
                    SyncProgress(
                        phase = SyncPhase.PUSHING,
                        processedRecords = mutationsPushed,
                        totalRecords = currentPending.size,
                    ),
                )
            }

            val durationMs = clock.now().toEpochMilliseconds() - startMs
            consecutiveFailures = 0
            _status.value = SyncStatus.Connected

            // Report success metrics to health monitor
            val finalPending = mutationQueue.pendingCount()
            healthListener?.onSyncSuccess(durationMs, finalPending)
            healthListener?.onPendingMutationsChanged(finalPending)

            SyncResult.Success(
                changesApplied = changes.size,
                mutationsPushed = mutationsPushed,
                conflictsResolved = conflictsResolved,
                durationMs = durationMs,
            )
        } catch (e: CancellationException) {
            // Respect structured concurrency: never swallow cancellation.
            throw e
        } catch (e: Exception) {
            consecutiveFailures++
            val syncError = classifyError(e)
            _status.value = SyncStatus.Error(syncError)

            // Report failure to health monitor
            healthListener?.onSyncFailure(syncError)

            // Apply exponential back-off before returning
            if (consecutiveFailures <= config.maxRetryAttempts) {
                val backoffMs = computeBackoff(consecutiveFailures)
                delay(backoffMs)
            }

            SyncResult.Failure(syncError)
        }
    }

    /**
     * Whether the sync loop is currently active.
     */
    fun isRunning(): Boolean = syncJob?.isActive == true

    // ── Internal helpers ────────────────────────────────────────

    /**
     * Check whether the current credentials are expiring soon and, if a
     * [credentialRefresher] was provided, obtain fresh credentials and
     * reconnect to the sync backend.
     *
     * Called at the start of every sync cycle to ensure the auth token
     * is valid for the duration of the pull → push round-trip.
     *
     * If the refresh fails, the engine proceeds with the current credentials.
     * They may still be valid ([SyncCredentials.isExpiringSoon] fires before
     * actual expiry). If they have truly expired, the pull/push will fail
     * and the engine's error handling will classify it as an [SyncError.AuthError].
     */
    private suspend fun refreshCredentialsIfNeeded() {
        val creds = credentials ?: return
        if (!creds.isExpiringSoon()) return

        val refresher = credentialRefresher ?: return

        try {
            val refreshed = refresher()
            credentials = refreshed

            // Reconnect with the fresh token so the provider uses it
            // for subsequent pull/push calls in this cycle.
            provider.disconnect()
            provider.connect(refreshed, config)
            _isConnected.value = true
        } catch (_: Exception) {
            // Refresh failed — proceed with current credentials.
        }
    }

    /**
     * Resolve previously detected [conflicts] against [pendingMutations].
     *
     * For each conflict, the appropriate [ConflictResolver] is selected via
     * [ConflictStrategy.resolverFor] and the resolution determines whether
     * the local mutation is kept, discarded, or replaced with merged data.
     *
     * @return Number of conflicts resolved.
     */
    private suspend fun resolveDetectedConflicts(
        conflicts: List<SyncConflict>,
        pendingMutations: List<SyncMutation>,
    ): Int {
        // Index pending mutations by "table:recordId" for O(1) lookup
        val pendingByEntity = pendingMutations.associateBy { it.entityKey }
        var resolved = 0

        for (conflict in conflicts) {
            val entityKey = "${conflict.tableName}:${conflict.recordId}"
            val pending = pendingByEntity[entityKey] ?: continue

            // Use table-specific resolver via ConflictStrategy
            val tableResolver = ConflictStrategy.resolverFor(conflict.tableName)
            val resolution = tableResolver.resolveConflict(conflict)

            when (resolution) {
                is ConflictResolution.AcceptServer,
                is ConflictResolution.Delete,
                -> {
                    // Server wins or delete: discard the local mutation
                    mutationQueue.dequeue(pending.id)
                }

                is ConflictResolution.AcceptLocal -> {
                    // Local wins: keep the mutation in the queue for pushing
                }

                is ConflictResolution.Merged -> {
                    // Merged: replace the mutation with merged data
                    mutationQueue.dequeue(pending.id)
                    mutationQueue.enqueue(pending.copy(rowData = resolution.data))
                }
            }

            resolved++
        }

        return resolved
    }

    /**
     * Classify an exception into a structured [SyncError].
     */
    private fun classifyError(e: Exception): SyncError {
        val message = e.message ?: "Unknown error"
        return when {
            message.contains("auth", ignoreCase = true) ||
                message.contains("401") ||
                message.contains("403") -> SyncError.AuthError(message)

            message.contains("timeout", ignoreCase = true) ||
                message.contains("connect", ignoreCase = true) ||
                message.contains("network", ignoreCase = true) -> SyncError.NetworkError(message)

            message.contains("500") ||
                message.contains("502") ||
                message.contains("503") -> SyncError.ServerError(500, message)

            else -> SyncError.Unknown(message)
        }
    }

    /**
     * Compute exponential back-off delay for the given [attempt] (1-based).
     */
    private fun computeBackoff(attempt: Int): Long {
        val raw = config.retryBackoffBaseMs * 2.0.pow(attempt - 1)
        return min(raw.toLong(), config.retryBackoffMaxMs)
    }
}
