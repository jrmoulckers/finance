// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.sync.conflict.ConflictStrategy
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * Represents a single sync conflict between local and remote records.
 */
data class ConflictItem(
    val id: String,
    val entityType: String,
    val entityId: String,
    val localValue: Map<String, String>,
    val remoteValue: Map<String, String>,
    val conflictFields: List<String>,
    val localTimestamp: String,
    val remoteTimestamp: String,
)

/**
 * Resolution strategy chosen by the user.
 */
enum class ResolutionStrategy(val displayName: String) {
    KEEP_LOCAL("Keep Local"),
    KEEP_REMOTE("Keep Remote"),
    MERGE("Merge"),
}

/**
 * UI state for the conflict resolution screen.
 */
data class ConflictResolutionUiState(
    val isLoading: Boolean = true,
    val conflicts: List<ConflictItem> = emptyList(),
    val resolvedCount: Int = 0,
    val isResolving: Boolean = false,
    val errorMessage: String? = null,
)

/**
 * ViewModel for the conflict resolution screen.
 *
 * Loads pending sync conflicts and allows the user to resolve them
 * individually using one of three strategies: keep local, keep remote,
 * or merge. Delegates actual resolution to the KMP
 * [ConflictStrategy.resolverFor] mechanism.
 *
 * ## Privacy
 * Conflict field names are logged but **never** their values.
 */
class ConflictResolutionViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(ConflictResolutionUiState())

    /** Observable UI state. */
    val uiState: StateFlow<ConflictResolutionUiState> = _uiState.asStateFlow()

    init {
        loadConflicts()
    }

    /**
     * Loads pending sync conflicts.
     */
    private fun loadConflicts() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            // TODO(#1296): Wire to actual PowerSync conflict detection.
            // For now, set empty list — conflicts will appear when
            // sync engine detects divergent records.
            _uiState.update {
                it.copy(isLoading = false, conflicts = emptyList())
            }
            Timber.i("Loaded %d pending conflicts", _uiState.value.conflicts.size)
        }
    }

    /**
     * Resolves a conflict with the chosen strategy.
     *
     * @param conflictId The ID of the conflict to resolve.
     * @param strategy The user-chosen resolution strategy.
     */
    fun resolveConflict(conflictId: String, strategy: ResolutionStrategy) {
        viewModelScope.launch {
            _uiState.update { it.copy(isResolving = true) }

            try {
                Timber.i(
                    "Resolving conflict %s with strategy %s",
                    conflictId,
                    strategy.name,
                )

                // TODO(#1296): Delegate to ConflictStrategy.resolverFor() from KMP sync package.
                // For now, simply remove the conflict from the list.
                _uiState.update { state ->
                    state.copy(
                        isResolving = false,
                        conflicts = state.conflicts.filter { it.id != conflictId },
                        resolvedCount = state.resolvedCount + 1,
                    )
                }
            } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
                Timber.e(e, "Failed to resolve conflict %s", conflictId)
                _uiState.update {
                    it.copy(
                        isResolving = false,
                        errorMessage = "Failed to resolve conflict",
                    )
                }
            }
        }
    }

    /**
     * Resolves all remaining conflicts with the given strategy.
     *
     * @param strategy The strategy to apply to all conflicts.
     */
    fun resolveAll(strategy: ResolutionStrategy) {
        viewModelScope.launch {
            _uiState.update { it.copy(isResolving = true) }

            val conflicts = _uiState.value.conflicts
            Timber.i("Resolving all %d conflicts with %s", conflicts.size, strategy.name)

            _uiState.update {
                it.copy(
                    isResolving = false,
                    conflicts = emptyList(),
                    resolvedCount = it.resolvedCount + conflicts.size,
                )
            }
        }
    }

    /**
     * Refreshes the conflict list from the sync engine.
     */
    fun refresh() {
        loadConflicts()
    }

    /**
     * Clears the error message.
     */
    fun dismissError() {
        _uiState.update { it.copy(errorMessage = null) }
    }
}
