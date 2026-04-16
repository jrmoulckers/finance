// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.monitoring

import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlin.test.*

/**
 * Tests for [MonitoringFacade] — composition, delegation, and reset.
 */
class MonitoringFacadeTest {

    private var currentTime = Instant.parse("2024-06-15T12:00:00Z")

    private val testClock = object : Clock {
        override fun now(): Instant = currentTime
    }

    /** Recording crash reporter for assertions. */
    private class RecordingCrashReporter : CrashReporter {
        val errors = mutableListOf<Pair<Throwable, Map<String, String>>>()
        val breadcrumbs = mutableListOf<String>()
        var capturedUserId: String? = null
        var enabled = true

        override fun reportError(exception: Throwable, context: Map<String, String>) {
            errors.add(exception to context)
        }

        override fun setUserId(id: String?) { capturedUserId = id }
        override fun log(message: String) { breadcrumbs.add(message) }
        override fun isEnabled(): Boolean = enabled
    }

    private fun createFacade(
        crashReporter: CrashReporter = NoOpCrashReporter,
        consent: Boolean = true,
    ): MonitoringFacade {
        return MonitoringFacade(
            crashReporter = crashReporter,
            metricsCollector = MetricsCollector(consentProvider = { consent }, clock = testClock),
            syncHealthMonitor = SyncHealthMonitor(clock = testClock),
            clock = testClock,
        )
    }

    // ── recordSyncSuccess ────────────────────────────────────────────

    @Test
    fun recordSyncSuccessUpdatesBothMonitorAndMetrics() {
        val facade = createFacade()
        facade.recordSyncSuccess(durationMs = 100, recordCount = 10)

        assertEquals(HealthStatus.Healthy, facade.syncHealthMonitor.healthStatus.value)
        assertEquals(1, facade.metricsCollector.bufferedEventCount)
    }

    // ── recordSyncFailure ────────────────────────────────────────────

    @Test
    fun recordSyncFailureUpdatesBothMonitorAndMetrics() {
        val recorder = RecordingCrashReporter()
        val facade = createFacade(crashReporter = recorder)
        facade.recordSyncSuccess(50) // establish baseline

        val error = RuntimeException("sync timeout")
        facade.recordSyncFailure(exception = error, durationMs = 200)

        assertEquals(1, facade.syncHealthMonitor.failureCount.value)
        assertEquals(1, recorder.errors.size)
        assertEquals("sync_engine", recorder.errors[0].second["component"])
    }

    @Test
    fun recordSyncFailureWithoutExceptionDoesNotReportCrash() {
        val recorder = RecordingCrashReporter()
        val facade = createFacade(crashReporter = recorder)
        facade.recordSyncSuccess(50)

        facade.recordSyncFailure(exception = null)
        assertTrue(recorder.errors.isEmpty())
    }

    // ── recordScreenView ─────────────────────────────────────────────

    @Test
    fun recordScreenViewDelegatesToMetrics() {
        val facade = createFacade()
        facade.recordScreenView("dashboard")
        assertEquals(1, facade.metricsCollector.bufferedEventCount)
    }

    // ── recordFeatureUsage ───────────────────────────────────────────

    @Test
    fun recordFeatureUsageDelegatesToMetrics() {
        val facade = createFacade()
        facade.recordFeatureUsage("create_budget", mapOf("period" to "MONTHLY"))
        assertEquals(1, facade.metricsCollector.bufferedEventCount)
    }

    // ── reportError ──────────────────────────────────────────────────

    @Test
    fun reportErrorDelegatesToCrashReporter() {
        val recorder = RecordingCrashReporter()
        val facade = createFacade(crashReporter = recorder)
        val error = IllegalStateException("test error")
        facade.reportError(error, mapOf("screen" to "budget_list"))

        assertEquals(1, recorder.errors.size)
        assertEquals("budget_list", recorder.errors[0].second["screen"])
    }

    // ── logBreadcrumb ────────────────────────────────────────────────

    @Test
    fun logBreadcrumbDelegatesToCrashReporter() {
        val recorder = RecordingCrashReporter()
        val facade = createFacade(crashReporter = recorder)
        facade.logBreadcrumb("Sync started")

        assertEquals(1, recorder.breadcrumbs.size)
        assertEquals("Sync started", recorder.breadcrumbs[0])
    }

    // ── startTimer ───────────────────────────────────────────────────

    @Test
    fun startTimerCreatesRunningTimer() {
        val facade = createFacade()
        val timer = facade.startTimer("test_op")
        assertFalse(timer.isStopped)
        assertEquals("test_op", timer.operationName)
    }

    // ── reset ────────────────────────────────────────────────────────

    @Test
    fun resetClearsAllState() {
        val recorder = RecordingCrashReporter()
        val facade = createFacade(crashReporter = recorder)

        facade.recordSyncSuccess(50, 10)
        facade.recordScreenView("dashboard")
        recorder.capturedUserId = "user-123"

        facade.reset()

        assertNull(facade.syncHealthMonitor.lastSyncTime.value)
        assertEquals(0, facade.metricsCollector.bufferedEventCount)
        assertNull(recorder.capturedUserId)
    }
}
