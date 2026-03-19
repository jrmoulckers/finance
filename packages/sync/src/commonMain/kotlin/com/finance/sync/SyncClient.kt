// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync

import com.finance.sync.auth.AuthCredentials
import com.finance.sync.auth.AuthManager
import com.finance.sync.queue.MutationQueue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlin.coroutines.CoroutineContext
import kotlin.coroutines.EmptyCoroutineContext

/**
 * High-level sync client that ties together authentication and the sync engine.
 *
 * This is the main entry point for platform apps to interact with the
 * sync subsystem. It manages the lifecycle of both authentication and
 * the periodic sync loop, exposing reactive state for UI consumption.
 *
 * ```kotlin
 * val client = SyncClient(
 *     config = syncConfig,
 *     authManager = authManager,
 *     syncEngine = defaultSyncEngine,
 *     mutationQueue = mutationQueue,
 * )
 *
 * // Sign in and start syncing
 * client.signInAndSync(AuthCredentials.EmailPassword(email, password))
 *
 * // Observe sync status
 * client.syncStatus.collect { status -> updateUI(status) }
 *
 * // Force immediate sync
 * val result = client.syncNow()
 *
 * // Sign out and stop syncing
 * client.signOut()
 *
 * // Release resources when done
 * client.destroy()
 * ```
 *
 * @param config Sync configuration including endpoint and intervals.
 * @param authManager Authentication manager for sign-in / sign-out / token refresh.
 * @param syncEngine The sync engine that performs pull → resolve → push cycles.
 * @param mutationQueue The queue of pending local mutations.
 * @param coroutineContext Parent coroutine context for the client's internal scope.
 *   Defaults to [EmptyCoroutineContext]; a [SupervisorJob] is always added
 *   so that individual child failures do not cancel sibling coroutines.
 */
class SyncClient(
    private val config: SyncConfig,
    private val authManager: AuthManager,
    private val syncEngine: DefaultSyncEngine,
    private val mutationQueue: MutationQueue,
    coroutineContext: CoroutineContext = EmptyCoroutineContext,
) {

    /**
     * Internal [CoroutineScope] for the sync loop and lifecycle tasks.
     *
     * Uses a [SupervisorJob] so that individual failures (e.g., a failed
     * sync cycle) do not cancel sibling coroutines (e.g., the pending-
     * mutation observer).
     */
    private val scope = CoroutineScope(coroutineContext + SupervisorJob())

    /** The running sync loop job, or `null` if sync is not active. */
    private var syncLoopJob: Job? = null

    // ── Reactive state ──────────────────────────────────────────────

    /**
     * Observable sync engine status.
     *
     * Mirrors [DefaultSyncEngine.status] for UI-layer consumption.
     * Emits [SyncStatus] updates as the engine transitions through
     * connection, syncing, error, and idle states.
     */
    val syncStatus: StateFlow<SyncStatus>
        get() = syncEngine.status

    /**
     * Observable authentication state.
     *
     * `true` when the [AuthManager] has a valid session, `false` otherwise.
     */
    val isAuthenticated: StateFlow<Boolean>
        get() = authManager.isAuthenticated

    /**
     * Observable count of local mutations waiting to be pushed to the server.
     *
     * Sourced from [MutationQueue.pendingCountFlow] and shared as a
     * [StateFlow] for UI-layer consumption.
     */
    val pendingMutationCount: StateFlow<Int> = mutationQueue.pendingCountFlow
        .stateIn(scope, SharingStarted.Eagerly, 0)

    // ── Lifecycle ───────────────────────────────────────────────────

    /**
     * Start the periodic sync loop.
     *
     * Requires an active authentication session in [authManager]. If no
     * session exists, this method returns without starting the loop.
     *
     * The loop runs until [stop] or [signOut] is called, or the client's
     * coroutine scope is cancelled via [destroy].
     */
    suspend fun start() {
        val session = authManager.currentSession.value ?: return
        val credentials = session.toSyncCredentials()

        syncLoopJob?.cancel()
        syncLoopJob = scope.launch {
            syncEngine.start(credentials)
        }
    }

    /**
     * Stop the sync loop and disconnect from the sync backend.
     *
     * Does **not** sign the user out — call [signOut] to clear the
     * authentication session as well.
     */
    suspend fun stop() {
        syncLoopJob?.cancel()
        syncLoopJob = null
        syncEngine.stop()
    }

    /**
     * Force an immediate sync cycle outside the periodic schedule.
     *
     * Can be called while the periodic loop is running; the engine's
     * internal mutex ensures only one cycle executes at a time.
     *
     * @return The [SyncResult] describing the outcome of the cycle.
     */
    suspend fun syncNow(): SyncResult {
        return syncEngine.syncNow()
    }

    /**
     * Authenticate with the given [credentials] and start syncing.
     *
     * Convenience method that combines [AuthManager.signIn] and [start]
     * in a single call:
     *
     * 1. Signs in via [authManager].
     * 2. Converts the resulting [com.finance.sync.auth.AuthSession] to
     *    [SyncCredentials].
     * 3. Launches the periodic sync loop with those credentials.
     *
     * @param credentials The authentication credentials (email/password, OAuth, etc.).
     * @return [Result.success] if sign-in succeeded and sync started,
     *   [Result.failure] if authentication failed. When authentication fails,
     *   no sync loop is started and the previous state is preserved.
     */
    suspend fun signInAndSync(credentials: AuthCredentials): Result<Unit> {
        val signInResult = authManager.signIn(credentials)
        return signInResult.fold(
            onSuccess = { session ->
                val syncCredentials = session.toSyncCredentials()
                syncLoopJob?.cancel()
                syncLoopJob = scope.launch {
                    syncEngine.start(syncCredentials)
                }
                Result.success(Unit)
            },
            onFailure = { error ->
                Result.failure(error)
            },
        )
    }

    /**
     * Sign out the current user and stop all sync activity.
     *
     * 1. Stops the sync loop and disconnects from the backend.
     * 2. Signs out via [AuthManager] (invalidates tokens server-side).
     * 3. Clears the local mutation queue.
     *
     * Safe to call multiple times; subsequent calls are no-ops.
     */
    suspend fun signOut() {
        stop()
        authManager.signOut()
        mutationQueue.clear()
    }

    /**
     * Release all resources held by this client.
     *
     * Cancels the internal [CoroutineScope], which terminates the sync loop
     * and any background observers. After calling [destroy], this instance
     * must not be reused.
     *
     * Platform DI containers should call this in their teardown lifecycle
     * (e.g., `onCleared()` in Android ViewModel, `deinit` on iOS).
     */
    fun destroy() {
        syncLoopJob?.cancel()
        syncLoopJob = null
        scope.cancel()
    }
}
