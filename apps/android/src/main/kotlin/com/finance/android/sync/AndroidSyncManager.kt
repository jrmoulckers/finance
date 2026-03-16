// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.sync

import android.content.Context
import com.finance.sync.SyncEngine
import com.finance.sync.SyncCredentials
import com.finance.sync.SyncStatus
import com.finance.sync.queue.MutationQueue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import timber.log.Timber

/**
 * Android-specific wrapper around the shared [SyncEngine].
 *
 * Responsibilities:
 * - Lifecycle management for sync sessions (connect / disconnect / continuous sync)
 * - Exposes [syncStatus] and [pendingMutations] as observable [StateFlow]s
 *   for UI consumption via Jetpack Compose
 * - Delegates network-awareness to [ConnectivityObserver]
 * - Runs all sync I/O on [Dispatchers.IO]
 *
 * This class does **not** own scheduling — background sync is handled by
 * [SyncWorker] via WorkManager.
 *
 * @property syncEngine     The shared KMP sync engine.
 * @property mutationQueue  The queue of pending local mutations.
 * @property connectivityObserver Network state observer.
 * @property context        Android application context (for WorkManager coordination).
 */
class AndroidSyncManager(
    private val syncEngine: SyncEngine,
    private val mutationQueue: MutationQueue,
    private val connectivityObserver: ConnectivityObserver,
    private val context: Context,
) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _syncStatus = MutableStateFlow<SyncStatus>(SyncStatus.Idle)

    /** Observable sync status for UI binding. */
    val syncStatus: StateFlow<SyncStatus> = _syncStatus.asStateFlow()

    private val _pendingMutations = MutableStateFlow(0)

    /** Number of local mutations awaiting push to the sync backend. */
    val pendingMutations: StateFlow<Int> = _pendingMutations.asStateFlow()

    private var syncJob: Job? = null

    /**
     * Connect to the sync backend with the given [credentials] and
     * begin a continuous sync loop.
     *
     * Safe to call multiple times — if a sync session is already active
     * the call is a no-op.
     */
    suspend fun startSync(credentials: SyncCredentials) = withContext(Dispatchers.IO) {
        if (syncJob?.isActive == true) {
            Timber.d("Sync already active — ignoring startSync call")
            return@withContext
        }

        Timber.i("Starting sync session for user=%s", credentials.userId)

        syncEngine.connect(credentials)

        syncJob = scope.launch {
            syncEngine.sync()
                .onEach { status ->
                    _syncStatus.value = status
                    refreshPendingCount()
                    Timber.d("Sync status: %s", status)
                }
                .catch { error ->
                    Timber.e(error, "Sync loop error")
                    _syncStatus.value = SyncStatus.Error(error)
                }
                .launchIn(this)

            // Keep pending-mutation count up to date while syncing.
            refreshPendingCount()
        }
    }

    /**
     * Stop the continuous sync loop and disconnect from the backend.
     */
    suspend fun stopSync() = withContext(Dispatchers.IO) {
        Timber.i("Stopping sync session")
        syncJob?.cancelAndJoin()
        syncJob = null
        syncEngine.disconnect()
        _syncStatus.value = SyncStatus.Disconnected
    }

    /**
     * Trigger a single one-shot sync cycle.
     *
     * Used by [SyncWorker] for background sync. If a continuous sync
     * loop is already active this starts an additional pull/push cycle
     * on the existing connection.
     */
    suspend fun syncNow(credentials: SyncCredentials) = withContext(Dispatchers.IO) {
        Timber.i("Running one-shot sync")
        _syncStatus.value = SyncStatus.Syncing()

        try {
            if (!syncEngine.isConnected.value) {
                syncEngine.connect(credentials)
            }
            // Collect only the first terminal status from sync().
            syncEngine.sync()
                .onEach { status ->
                    _syncStatus.value = status
                    Timber.d("One-shot sync status: %s", status)
                }
                .catch { error ->
                    Timber.e(error, "One-shot sync error")
                    _syncStatus.value = SyncStatus.Error(error)
                }
                .collect { /* consume until completed */ }
        } finally {
            refreshPendingCount()
        }
    }

    /**
     * Observe network connectivity changes.
     *
     * Returns a [Flow] that emits `true` when the device is online
     * and `false` when offline.
     */
    fun observeConnectivity(): Flow<Boolean> = connectivityObserver.observe()

    /**
     * Refresh the [pendingMutations] count from the mutation queue.
     */
    private suspend fun refreshPendingCount() {
        _pendingMutations.value = mutationQueue.pendingCount()
    }
}
