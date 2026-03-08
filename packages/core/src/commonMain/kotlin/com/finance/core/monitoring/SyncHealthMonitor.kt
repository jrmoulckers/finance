// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.monitoring

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant

/**
 * Tracks sync subsystem health metrics on the client.
 *
 * Maintains a rolling window of sync performance data and exposes
 * the current [HealthStatus] as a reactive [StateFlow]. Platform UI
 * layers observe [healthStatus] to display sync indicators.
 *
 * This class is not thread-safe — callers must synchronize access
 * or confine usage to a single coroutine dispatcher.
 *
 * @param clock Clock source for timestamps (injectable for testing).
 * @param maxDurationSamples Maximum number of sync duration samples
 *   retained for average calculation.
 */
class SyncHealthMonitor(
    private val clock: Clock = Clock.System,
    private val maxDurationSamples: Int = 100,
) {

    private val _lastSyncTime = MutableStateFlow<Instant?>(null)

    /** Timestamp of the last successful sync, or null if never synced. */
    val lastSyncTime: StateFlow<Instant?> = _lastSyncTime.asStateFlow()

    private val _pendingMutations = MutableStateFlow(0)

    /** Number of local mutations waiting to be synced to the server. */
    val pendingMutations: StateFlow<Int> = _pendingMutations.asStateFlow()

    private val _failureCount = MutableStateFlow(0)

    /** Number of consecutive sync failures since the last success. */
    val failureCount: StateFlow<Int> = _failureCount.asStateFlow()

    private val _averageSyncDurationMs = MutableStateFlow(0L)

    /** Rolling average sync duration in milliseconds. */
    val averageSyncDurationMs: StateFlow<Long> = _averageSyncDurationMs.asStateFlow()

    private val _healthStatus = MutableStateFlow<HealthStatus>(HealthStatus.Healthy)

    /** Current computed health status of the sync subsystem. */
    val healthStatus: StateFlow<HealthStatus> = _healthStatus.asStateFlow()

    private val durationSamples = mutableListOf<Long>()

    /**
     * Record a successful sync completion.
     *
     * Resets the failure counter, updates the last sync timestamp,
     * and adds the sync duration to the rolling average.
     *
     * @param durationMs Time taken for the sync operation in milliseconds.
     */
    fun recordSyncSuccess(durationMs: Long) {
        require(durationMs >= 0) { "Sync duration must be non-negative, got $durationMs" }

        _lastSyncTime.value = clock.now()
        _failureCount.value = 0
        addDurationSample(durationMs)
        refreshHealthStatus()
    }

    /**
     * Record a sync failure.
     *
     * Increments the consecutive failure counter and re-evaluates health.
     */
    fun recordSyncFailure() {
        _failureCount.value += 1
        refreshHealthStatus()
    }

    /**
     * Update the count of pending local mutations.
     *
     * @param count Current number of unsynced mutations.
     */
    fun updatePendingMutations(count: Int) {
        require(count >= 0) { "Pending mutation count must be non-negative, got $count" }

        _pendingMutations.value = count
        refreshHealthStatus()
    }

    /**
     * Force a re-evaluation of the health status.
     *
     * Call this periodically (e.g., every minute) to detect staleness
     * even when no sync events are occurring.
     */
    fun refreshHealthStatus() {
        _healthStatus.value = HealthStatus.evaluate(
            lastSyncTime = _lastSyncTime.value,
            currentTime = clock.now(),
            failureCount = _failureCount.value,
            pendingMutations = _pendingMutations.value,
        )
    }

    /**
     * Reset all metrics to their initial state.
     *
     * Useful when the user signs out or switches accounts.
     */
    fun reset() {
        _lastSyncTime.value = null
        _pendingMutations.value = 0
        _failureCount.value = 0
        _averageSyncDurationMs.value = 0L
        durationSamples.clear()
        _healthStatus.value = HealthStatus.Healthy
    }

    private fun addDurationSample(durationMs: Long) {
        durationSamples.add(durationMs)
        if (durationSamples.size > maxDurationSamples) {
            durationSamples.removeAt(0)
        }
        _averageSyncDurationMs.value = durationSamples.average().toLong()
    }
}
