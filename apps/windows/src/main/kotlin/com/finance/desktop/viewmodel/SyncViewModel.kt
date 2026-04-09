// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.sync.DefaultSyncEngine
import com.finance.sync.SyncStatus
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/**
 * ViewModel exposing sync engine status to the Windows desktop UI.
 *
 * Wraps the [DefaultSyncEngine] from the KMP sync package and maps its
 * reactive [SyncStatus] to a UI-friendly state representation.
 *
 * Injected via Koin and consumed by settings / dashboard screens that
 * display sync indicators.
 */
class SyncViewModel(
    private val syncEngine: DefaultSyncEngine,
) : DesktopViewModel() {

    /** Raw sync engine status for fine-grained observation. */
    val syncStatus: StateFlow<SyncStatus> = syncEngine.status

    /** Simplified label for the current sync status. */
    val syncStatusLabel: StateFlow<String> = syncEngine.status
        .map { status -> formatStatusLabel(status) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, "Idle")

    /** Whether the sync engine has an active connection to the backend. */
    val isConnected: StateFlow<Boolean> = syncEngine.isConnected

    private fun formatStatusLabel(status: SyncStatus): String = when (status) {
        is SyncStatus.Idle -> "Idle"
        is SyncStatus.Connecting -> "Connecting…"
        is SyncStatus.Connected -> "Connected"
        is SyncStatus.Syncing -> "Syncing…"
        is SyncStatus.Disconnected -> "Disconnected"
        is SyncStatus.Error -> "Error: ${formatError(status.error)}"
    }

    private fun formatError(error: com.finance.sync.SyncError): String = when (error) {
        is com.finance.sync.SyncError.NetworkError -> "Network — ${error.message}"
        is com.finance.sync.SyncError.AuthError -> "Auth — ${error.message}"
        is com.finance.sync.SyncError.ConflictError -> "${error.conflicts} conflict(s)"
        is com.finance.sync.SyncError.ServerError -> "Server ${error.statusCode}"
        is com.finance.sync.SyncError.Unknown -> error.cause
    }
}
