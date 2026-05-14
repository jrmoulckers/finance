// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.sync

import com.finance.sync.*
import com.finance.sync.auth.AuthSession
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import java.util.logging.Level
import java.util.logging.Logger

/**
 * Desktop sync coordinator that manages the PowerSync JVM client lifecycle.
 *
 * Wraps the KMP [DefaultSyncEngine] with desktop-specific lifecycle management:
 * - Background sync loop with configurable interval
 * - Automatic reconnection on network changes
 * - Sync status exposure for system tray indicator
 * - Graceful shutdown on application exit
 *
 * ## Sync Status for System Tray
 *
 * The [syncStatusForTray] flow emits human-readable status strings suitable
 * for display in the Windows system tray tooltip.
 *
 * @param syncEngine The KMP sync engine from `packages/sync`.
 * @param syncConfig Sync configuration (endpoint, intervals, etc.).
 */
class DesktopSyncCoordinator(
    private val syncEngine: DefaultSyncEngine,
    private val syncConfig: SyncConfig,
) {
    companion object {
        private val logger: Logger = Logger.getLogger(DesktopSyncCoordinator::class.java.name)
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var syncJob: Job? = null

    /** Reactive sync status for UI observation. */
    val syncStatus: StateFlow<SyncStatus> = syncEngine.status

    /** Whether the sync engine has an active connection. */
    val isConnected: StateFlow<Boolean> = syncEngine.isConnected

    /** Human-readable sync status for system tray tooltip. */
    val syncStatusForTray: StateFlow<String> = syncEngine.status
        .map { formatTrayStatus(it) }
        .stateIn(scope, SharingStarted.Eagerly, "Sync: Idle")

    /** Last sync timestamp in millis (0 if never synced). */
    private val _lastSyncTime = MutableStateFlow(0L)
    val lastSyncTime: StateFlow<Long> = _lastSyncTime.asStateFlow()

    /** Number of pending mutations awaiting push. */
    private val _pendingMutations = MutableStateFlow(0)
    val pendingMutations: StateFlow<Int> = _pendingMutations.asStateFlow()

    /**
     * Start the background sync loop.
     *
     * Connects to the sync backend and begins periodic sync cycles.
     * The loop runs until [stop] is called or the application exits.
     *
     * @param session Current auth session for sync credentials.
     */
    fun start(session: AuthSession) {
        if (syncJob?.isActive == true) {
            logger.info("Sync coordinator already running")
            return
        }

        syncJob = scope.launch {
            @Suppress("TooGenericExceptionCaught") // Sync cycle error boundary
            try {
                logger.info("Starting sync coordinator (interval: ${syncConfig.syncIntervalMs}ms)")
                val credentials = session.toSyncCredentials()
                syncEngine.connect(credentials)

                if (!syncEngine.isConnected.value) {
                    logger.warning("Failed to establish sync connection")
                    return@launch
                }

                // Periodic sync loop
                while (isActive) {
                    try {
                        val result = syncEngine.syncNow()
                        when (result) {
                            is SyncResult.Success -> {
                                _lastSyncTime.value = System.currentTimeMillis()
                                logger.fine(
                                    "Sync cycle complete: ${result.changesApplied} changes, " +
                                        "${result.mutationsPushed} pushed in ${result.durationMs}ms"
                                )
                            }
                            is SyncResult.Failure -> {
                                logger.warning("Sync cycle failed: ${result.error}")
                            }
                        }
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        logger.log(Level.WARNING, "Sync cycle error", e)
                    }

                    delay(syncConfig.syncIntervalMs)
                }
            } catch (e: CancellationException) {
                logger.info("Sync coordinator cancelled: ${e.message}")
            } catch (e: Exception) {
                logger.log(Level.SEVERE, "Sync coordinator fatal error", e)
            }
        }
    }

    /**
     * Force an immediate sync cycle (outside the regular interval).
     *
     * Useful when the user manually triggers sync from the UI.
     */
    suspend fun syncNow(): SyncResult {
        return syncEngine.syncNow()
    }

    /**
     * Stop the background sync loop and disconnect.
     */
    fun stop() {
        syncJob?.cancel()
        syncJob = null
        scope.launch {
            @Suppress("TooGenericExceptionCaught") // Sync disconnect must not crash
            try {
                syncEngine.disconnect()
            } catch (e: Exception) {
                logger.log(Level.WARNING, "Error during sync disconnect", e)
            }
        }
        logger.info("Sync coordinator stopped")
    }

    /**
     * Clean up resources. Call during application shutdown.
     */
    fun dispose() {
        stop()
        scope.cancel()
    }

    private fun formatTrayStatus(status: SyncStatus): String = when (status) {
        is SyncStatus.Idle -> "Sync: Idle"
        is SyncStatus.Connecting -> "Sync: Connecting…"
        is SyncStatus.Connected -> "Sync: Connected ✓"
        is SyncStatus.Syncing -> {
            val progress = status.progress
            when (progress.phase) {
                SyncPhase.PULLING -> "Sync: Downloading changes…"
                SyncPhase.PUSHING -> "Sync: Uploading changes…"
                SyncPhase.RESOLVING_CONFLICTS -> "Sync: Resolving conflicts…"
            }
        }
        is SyncStatus.Disconnected -> "Sync: Disconnected"
        is SyncStatus.Error -> "Sync: Error"
    }
}
