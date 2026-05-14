// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import timber.log.Timber

class OptimisticUpdateTracker {

    data class PendingUpdate(val entityId: String, val rollbackData: Any?, val retryCount: Int = 0)

    private val pendingUpdates = mutableMapOf<String, PendingUpdate>()
    private val _pendingCount = MutableStateFlow(0)
    val pendingCount: StateFlow<Int> = _pendingCount.asStateFlow()

    @Synchronized fun trackUpdate(entityId: String, rollbackData: Any?) {
        pendingUpdates[entityId] = PendingUpdate(entityId, rollbackData)
        _pendingCount.value = pendingUpdates.size
        Timber.d("Optimistic update tracked: %s (pending: %d)", entityId, pendingUpdates.size)
    }

    @Synchronized fun confirmUpdate(entityId: String) {
        pendingUpdates.remove(entityId)
        _pendingCount.value = pendingUpdates.size
        Timber.d("Optimistic update confirmed: %s", entityId)
    }

    @Synchronized fun rollbackUpdate(entityId: String): Any? {
        val pending = pendingUpdates.remove(entityId)
        _pendingCount.value = pendingUpdates.size
        if (pending != null) Timber.d("Optimistic update rolled back: %s", entityId)
        return pending?.rollbackData
    }

    @Synchronized fun incrementRetry(entityId: String): Int {
        val pending = pendingUpdates[entityId] ?: return -1
        val updated = pending.copy(retryCount = pending.retryCount + 1)
        pendingUpdates[entityId] = updated
        return updated.retryCount
    }

    @Synchronized fun hasPendingUpdate(entityId: String): Boolean = entityId in pendingUpdates
    @Synchronized fun allPending(): List<PendingUpdate> = pendingUpdates.values.toList()
    @Synchronized fun clearAll() { pendingUpdates.clear(); _pendingCount.value = 0 }

    companion object { const val MAX_RETRIES = 3 }
}
