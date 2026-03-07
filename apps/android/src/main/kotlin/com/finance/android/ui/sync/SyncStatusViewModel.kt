package com.finance.android.ui.sync

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.sync.MutationOperation
import com.finance.sync.SyncEngine
import com.finance.sync.SyncStatus
import com.finance.sync.queue.MutationQueue
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant

/**
 * ViewModel backing [SyncStatusScreen] and [SyncStatusIcon].
 *
 * Observes the shared KMP [SyncEngine] connection state and [MutationQueue]
 * pending count, and exposes a single [SyncStatusUiState] flow consumed by
 * Compose via `collectAsStateWithLifecycle`.
 *
 * @param syncEngine The KMP sync engine providing connectivity and sync status.
 * @param mutationQueue The mutation queue supplying pending-change metadata.
 * @param clock Clock for computing relative timestamps (injectable for tests).
 */
class SyncStatusViewModel(
    private val syncEngine: SyncEngine,
    private val mutationQueue: MutationQueue,
    private val clock: Clock = Clock.System,
) : ViewModel() {

    // ── Internal mutable state ───────────────────────────────────────────

    private val _lastSyncInstant = MutableStateFlow<Instant?>(null)
    private val _syncStatus = MutableStateFlow<SyncStatus>(SyncStatus.Idle)
    private val _isSyncingNow = MutableStateFlow(false)
    private val _conflicts = MutableStateFlow<List<ConflictItem>>(emptyList())

    // ── Public UI state ──────────────────────────────────────────────────

    /**
     * Combined UI state derived from multiple internal flows.
     *
     * Uses [SharingStarted.WhileSubscribed] with a 5-second stop timeout
     * to survive brief configuration changes without restarting collection.
     */
    val uiState: StateFlow<SyncStatusUiState> = combine(
        syncEngine.isConnected,
        _syncStatus,
        _lastSyncInstant,
        _isSyncingNow,
        _conflicts,
    ) { isConnected, syncStatus, lastSync, syncing, conflicts ->
        buildUiState(
            isConnected = isConnected,
            syncStatus = syncStatus,
            lastSyncInstant = lastSync,
            isSyncing = syncing,
            conflicts = conflicts,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = SyncStatusUiState(),
    )

    // ── Initialisation ───────────────────────────────────────────────────

    init {
        observeSyncStatus()
    }

    /**
     * Collects [SyncEngine.sync] emissions and maps them to internal state
     * flows. Connected / Idle states update the last-sync timestamp.
     */
    private fun observeSyncStatus() {
        viewModelScope.launch {
            syncEngine.sync().collect { status ->
                _syncStatus.value = status

                when (status) {
                    is SyncStatus.Connected,
                    is SyncStatus.Idle,
                    -> {
                        _lastSyncInstant.value = clock.now()
                        _isSyncingNow.value = false
                    }
                    is SyncStatus.Syncing -> {
                        _isSyncingNow.value = true
                    }
                    is SyncStatus.Error -> {
                        _isSyncingNow.value = false
                    }
                    is SyncStatus.Disconnected -> {
                        _isSyncingNow.value = false
                    }
                }
            }
        }
    }

    // ── Actions ──────────────────────────────────────────────────────────

    /**
     * Trigger a manual sync cycle.
     *
     * The [SyncEngine.sync] flow will emit [SyncStatus.Syncing] which this
     * ViewModel already observes, so no additional state management is needed.
     */
    fun syncNow() {
        if (_isSyncingNow.value) return

        viewModelScope.launch {
            _isSyncingNow.value = true
            // Re-collect from the sync flow; the engine handles deduplication
            syncEngine.sync().collect { status ->
                _syncStatus.value = status
                if (status is SyncStatus.Connected || status is SyncStatus.Idle) {
                    _lastSyncInstant.value = clock.now()
                    _isSyncingNow.value = false
                    return@collect
                }
                if (status is SyncStatus.Error || status is SyncStatus.Disconnected) {
                    _isSyncingNow.value = false
                    return@collect
                }
            }
        }
    }

    /**
     * Resolve a conflict in favour of the local version.
     *
     * @param conflictId Identifier matching [ConflictItem.id].
     */
    fun keepMine(conflictId: String) {
        _conflicts.update { current -> current.filter { it.id != conflictId } }
        // TODO: Delegate to ConflictResolver with local SyncChange (#171)
    }

    /**
     * Resolve a conflict in favour of the remote version.
     *
     * @param conflictId Identifier matching [ConflictItem.id].
     */
    fun keepTheirs(conflictId: String) {
        _conflicts.update { current -> current.filter { it.id != conflictId } }
        // TODO: Delegate to ConflictResolver with remote SyncChange (#171)
    }

    /**
     * Dismiss a conflict without resolution. The conflict remains in the
     * backend queue and will resurface on next sync.
     *
     * @param conflictId Identifier matching [ConflictItem.id].
     */
    fun cancelConflict(conflictId: String) {
        // No-op on the conflict list — keep it visible for the next sync pass
    }

    // ── State mapping ────────────────────────────────────────────────────

    private suspend fun buildUiState(
        isConnected: Boolean,
        syncStatus: SyncStatus,
        lastSyncInstant: Instant?,
        isSyncing: Boolean,
        conflicts: List<ConflictItem>,
    ): SyncStatusUiState {
        val iconState = resolveIconState(isConnected, syncStatus, conflicts)
        val pendingMutations = mutationQueue.allPending()

        return SyncStatusUiState(
            syncIconState = iconState,
            lastSyncRelative = lastSyncInstant?.let { formatRelativeTime(it) } ?: "Never",
            pendingChangeCount = pendingMutations.size,
            pendingChanges = pendingMutations.map { mutation ->
                PendingChangeItem(
                    id = mutation.id,
                    tableName = mutation.tableName,
                    operation = mutation.operation.toDisplayString(),
                    summary = mutation.rowData.entries
                        .take(2)
                        .joinToString(", ") { "${it.key}: ${it.value ?: "null"}" },
                )
            },
            conflicts = conflicts,
            isSyncingNow = isSyncing,
        )
    }

    /**
     * Derive the [SyncIconState] from connectivity, sync status, and conflict state.
     */
    private fun resolveIconState(
        isConnected: Boolean,
        syncStatus: SyncStatus,
        conflicts: List<ConflictItem>,
    ): SyncIconState = when {
        !isConnected -> SyncIconState.OFFLINE
        conflicts.isNotEmpty() -> SyncIconState.ERROR
        syncStatus is SyncStatus.Syncing -> SyncIconState.SYNCING
        syncStatus is SyncStatus.Error -> SyncIconState.ERROR
        else -> SyncIconState.SYNCED
    }

    /**
     * Format an [Instant] as a human-readable relative string.
     *
     * Examples: "Just now", "2 minutes ago", "1 hour ago", "3 days ago".
     */
    private fun formatRelativeTime(instant: Instant): String {
        val now = clock.now()
        val diff = now - instant
        val seconds = diff.inWholeSeconds

        return when {
            seconds < 60 -> "Just now"
            seconds < 3600 -> {
                val minutes = seconds / 60
                if (minutes == 1L) "1 minute ago" else "$minutes minutes ago"
            }
            seconds < 86400 -> {
                val hours = seconds / 3600
                if (hours == 1L) "1 hour ago" else "$hours hours ago"
            }
            else -> {
                val days = seconds / 86400
                if (days == 1L) "1 day ago" else "$days days ago"
            }
        }
    }
}

/**
 * Map [MutationOperation] to a user-facing label.
 */
private fun MutationOperation.toDisplayString(): String = when (this) {
    MutationOperation.INSERT -> "Added"
    MutationOperation.UPDATE -> "Updated"
    MutationOperation.DELETE -> "Deleted"
}
