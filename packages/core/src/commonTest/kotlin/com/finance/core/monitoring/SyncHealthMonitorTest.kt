// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.monitoring

import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlin.test.*
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds

/**
 * Tests for [SyncHealthMonitor] — state transitions, threshold evaluation,
 * rolling averages, and reset.
 */
class SyncHealthMonitorTest {

    private var currentTime = Instant.parse("2024-06-15T12:00:00Z")

    private val testClock = object : Clock {
        override fun now(): Instant = currentTime
    }

    private fun createMonitor(maxSamples: Int = 100) =
        SyncHealthMonitor(clock = testClock, maxDurationSamples = maxSamples)

    // ── Initial state ────────────────────────────────────────────────

    @Test
    fun initialLastSyncTimeIsNull() {
        val monitor = createMonitor()
        assertNull(monitor.lastSyncTime.value)
    }

    @Test
    fun initialPendingMutationsIsZero() {
        val monitor = createMonitor()
        assertEquals(0, monitor.pendingMutations.value)
    }

    @Test
    fun initialFailureCountIsZero() {
        val monitor = createMonitor()
        assertEquals(0, monitor.failureCount.value)
    }

    @Test
    fun initialHealthStatusIsHealthyBeforeRefresh() {
        // Before any refreshHealthStatus call, the default is Healthy
        val monitor = createMonitor()
        assertEquals(HealthStatus.Healthy, monitor.healthStatus.value)
    }

    @Test
    fun initialHealthAfterRefreshIsUnhealthy() {
        // After refreshing with no sync history, should be Unhealthy
        val monitor = createMonitor()
        monitor.refreshHealthStatus()
        assertTrue(monitor.healthStatus.value is HealthStatus.Unhealthy)
    }

    // ── recordSyncSuccess ────────────────────────────────────────────

    @Test
    fun recordSyncSuccessUpdatesLastSyncTime() {
        val monitor = createMonitor()
        monitor.recordSyncSuccess(100L)
        assertEquals(currentTime, monitor.lastSyncTime.value)
    }

    @Test
    fun recordSyncSuccessResetsFailureCount() {
        val monitor = createMonitor()
        monitor.recordSyncFailure()
        monitor.recordSyncFailure()
        assertEquals(2, monitor.failureCount.value)
        monitor.recordSyncSuccess(50L)
        assertEquals(0, monitor.failureCount.value)
    }

    @Test
    fun recordSyncSuccessSetsHealthToHealthy() {
        val monitor = createMonitor()
        monitor.recordSyncSuccess(50L)
        assertEquals(HealthStatus.Healthy, monitor.healthStatus.value)
    }

    @Test
    fun recordSyncSuccessRejectNegativeDuration() {
        val monitor = createMonitor()
        assertFailsWith<IllegalArgumentException> {
            monitor.recordSyncSuccess(-1L)
        }
    }

    // ── recordSyncFailure ────────────────────────────────────────────

    @Test
    fun recordSyncFailureIncrementsCount() {
        val monitor = createMonitor()
        monitor.recordSyncFailure()
        assertEquals(1, monitor.failureCount.value)
        monitor.recordSyncFailure()
        assertEquals(2, monitor.failureCount.value)
    }

    @Test
    fun singleFailureDegrades() {
        val monitor = createMonitor()
        monitor.recordSyncSuccess(50L) // establish healthy baseline
        monitor.recordSyncFailure()
        val status = monitor.healthStatus.value
        assertTrue(status is HealthStatus.Degraded, "Expected Degraded, got $status")
    }

    @Test
    fun multipleFailuresBecomeUnhealthy() {
        val monitor = createMonitor()
        monitor.recordSyncSuccess(50L)
        repeat(4) { monitor.recordSyncFailure() }
        val status = monitor.healthStatus.value
        assertTrue(status is HealthStatus.Unhealthy, "Expected Unhealthy, got $status")
    }

    // ── updatePendingMutations ───────────────────────────────────────

    @Test
    fun updatePendingMutationsSetsValue() {
        val monitor = createMonitor()
        monitor.updatePendingMutations(25)
        assertEquals(25, monitor.pendingMutations.value)
    }

    @Test
    fun highPendingMutationsDegrades() {
        val monitor = createMonitor()
        monitor.recordSyncSuccess(50L)
        monitor.updatePendingMutations(50)
        val status = monitor.healthStatus.value
        assertTrue(status is HealthStatus.Degraded, "Expected Degraded, got $status")
    }

    @Test
    fun veryHighPendingMutationsIsUnhealthy() {
        val monitor = createMonitor()
        monitor.recordSyncSuccess(50L)
        monitor.updatePendingMutations(201)
        val status = monitor.healthStatus.value
        assertTrue(status is HealthStatus.Unhealthy, "Expected Unhealthy, got $status")
    }

    @Test
    fun rejectNegativePendingMutations() {
        val monitor = createMonitor()
        assertFailsWith<IllegalArgumentException> {
            monitor.updatePendingMutations(-1)
        }
    }

    // ── Sync age thresholds ──────────────────────────────────────────

    @Test
    fun healthDegradesByAge() {
        val monitor = createMonitor()
        monitor.recordSyncSuccess(50L)
        currentTime = currentTime + 6.minutes // > 5 min threshold
        monitor.refreshHealthStatus()
        val status = monitor.healthStatus.value
        assertTrue(status is HealthStatus.Degraded, "Expected Degraded after 6 min, got $status")
    }

    @Test
    fun healthIsUnhealthyByAge() {
        val monitor = createMonitor()
        monitor.recordSyncSuccess(50L)
        currentTime = currentTime + 31.minutes // > 30 min threshold
        monitor.refreshHealthStatus()
        val status = monitor.healthStatus.value
        assertTrue(status is HealthStatus.Unhealthy, "Expected Unhealthy after 31 min, got $status")
    }

    // ── Rolling average ──────────────────────────────────────────────

    @Test
    fun averageSyncDurationMs() {
        val monitor = createMonitor()
        monitor.recordSyncSuccess(100L)
        monitor.recordSyncSuccess(200L)
        monitor.recordSyncSuccess(300L)
        assertEquals(200L, monitor.averageSyncDurationMs.value)
    }

    @Test
    fun averageRollsOverMaxSamples() {
        val monitor = createMonitor(maxSamples = 3)
        monitor.recordSyncSuccess(100L) // [100]
        monitor.recordSyncSuccess(200L) // [100, 200]
        monitor.recordSyncSuccess(300L) // [100, 200, 300]
        monitor.recordSyncSuccess(400L) // [200, 300, 400] — dropped 100
        assertEquals(300L, monitor.averageSyncDurationMs.value)
    }

    // ── Reset ────────────────────────────────────────────────────────

    @Test
    fun resetClearsAllState() {
        val monitor = createMonitor()
        monitor.recordSyncSuccess(50L)
        monitor.recordSyncFailure()
        monitor.updatePendingMutations(10)

        monitor.reset()

        assertNull(monitor.lastSyncTime.value)
        assertEquals(0, monitor.failureCount.value)
        assertEquals(0, monitor.pendingMutations.value)
        assertEquals(0L, monitor.averageSyncDurationMs.value)
        assertEquals(HealthStatus.Healthy, monitor.healthStatus.value)
    }
}
