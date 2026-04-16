// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.monitoring

import kotlinx.datetime.Clock

/**
 * Composes all monitoring subsystems into a single facade.
 *
 * Platform app entry points create a [MonitoringFacade] at startup and inject
 * it into business logic layers. This avoids scattering individual monitoring
 * dependencies across the codebase.
 *
 * All operations are consent-gated: if the user has not opted in to analytics
 * and crash reporting, the facade's components silently discard data.
 *
 * Usage:
 * ```
 * val monitoring = MonitoringFacade(
 *     crashReporter = platformCrashReporter,
 *     metricsCollector = MetricsCollector(consentProvider = { userConsent }),
 *     syncHealthMonitor = SyncHealthMonitor(),
 * )
 *
 * // Track a sync operation
 * val timer = monitoring.startTimer()
 * try {
 *     performSync()
 *     monitoring.recordSyncSuccess(timer.stop())
 * } catch (e: Exception) {
 *     monitoring.recordSyncFailure(e)
 * }
 * ```
 *
 * @param crashReporter Platform crash reporter (or [NoOpCrashReporter]).
 * @param metricsCollector Consent-gated metrics collector.
 * @param syncHealthMonitor Sync health tracker.
 * @param clock Clock source for timestamps (injectable for testing).
 */
class MonitoringFacade(
    val crashReporter: CrashReporter = NoOpCrashReporter,
    val metricsCollector: MetricsCollector = MetricsCollector(consentProvider = { false }),
    val syncHealthMonitor: SyncHealthMonitor = SyncHealthMonitor(),
    private val clock: Clock = Clock.System,
) {

    /**
     * Start a [PerformanceTimer] for measuring operation duration.
     *
     * @param operationName Optional name for the operation being timed.
     * @return A started [PerformanceTimer].
     */
    fun startTimer(operationName: String = ""): PerformanceTimer {
        return PerformanceTimer.start(clock, operationName)
    }

    /**
     * Record a successful sync operation.
     *
     * Updates both the sync health monitor and metrics collector.
     *
     * @param durationMs Duration of the sync in milliseconds.
     * @param recordCount Number of records synced.
     */
    fun recordSyncSuccess(durationMs: Long, recordCount: Int = 0) {
        syncHealthMonitor.recordSyncSuccess(durationMs)
        metricsCollector.recordSyncPerformance(
            durationMs = durationMs,
            recordCount = recordCount,
            success = true,
        )
    }

    /**
     * Record a failed sync operation.
     *
     * Updates the sync health monitor, metrics collector, and crash reporter.
     *
     * @param exception The exception that caused the failure, or null.
     * @param durationMs Duration of the sync attempt in milliseconds.
     */
    fun recordSyncFailure(exception: Throwable? = null, durationMs: Long = 0) {
        syncHealthMonitor.recordSyncFailure()
        metricsCollector.recordSyncPerformance(
            durationMs = durationMs,
            recordCount = 0,
            success = false,
        )
        if (exception != null) {
            crashReporter.reportError(
                exception = exception,
                context = mapOf("component" to "sync_engine"),
            )
        }
    }

    /**
     * Record a screen view in the metrics collector.
     *
     * @param screenName Screen identifier (e.g., "dashboard", "budget_list").
     */
    fun recordScreenView(screenName: String) {
        metricsCollector.recordScreenView(screenName)
    }

    /**
     * Record a feature usage event in the metrics collector.
     *
     * @param featureName Feature identifier (e.g., "create_budget").
     * @param properties Optional anonymous metadata.
     */
    fun recordFeatureUsage(featureName: String, properties: Map<String, String> = emptyMap()) {
        metricsCollector.recordFeatureUsage(featureName, properties)
    }

    /**
     * Report a non-fatal error through the crash reporter.
     *
     * @param exception The exception to report.
     * @param context Optional diagnostic context (no PII or financial data).
     */
    fun reportError(exception: Throwable, context: Map<String, String> = emptyMap()) {
        crashReporter.reportError(exception, context)
    }

    /**
     * Log a diagnostic breadcrumb.
     *
     * @param message Descriptive message (no PII or financial data).
     */
    fun logBreadcrumb(message: String) {
        crashReporter.log(message)
    }

    /**
     * Reset all monitoring state.
     *
     * Call on user sign-out or account switch.
     */
    fun reset() {
        syncHealthMonitor.reset()
        metricsCollector.clearEvents()
        crashReporter.setUserId(null)
    }
}
