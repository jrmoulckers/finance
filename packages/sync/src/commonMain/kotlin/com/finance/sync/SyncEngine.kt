package com.finance.sync

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

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
