// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.performance

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.logging.Logger

/**
 * Composable effect that records first-render timing for a screen.
 *
 * Call this at the top of each screen composable to automatically track
 * when the screen first becomes visible:
 *
 * ```kotlin
 * @Composable
 * fun DashboardScreen() {
 *     TrackScreenRender("dashboard")
 *     // … rest of screen …
 * }
 * ```
 *
 * The metric is recorded as `screen.<name>.first_render`.
 */
@Composable
fun TrackScreenRender(screenName: String) {
    LaunchedEffect(screenName) {
        PerformanceTracker.markStart("screen.$screenName.first_render")
        // The first frame after LaunchedEffect runs is the render frame
        kotlinx.coroutines.yield()
        PerformanceTracker.markEnd("screen.$screenName.first_render", MetricCategory.RENDER)
    }
}

/**
 * Wraps a suspend block with automatic performance timing.
 *
 * Records the duration of [block] under the given [metricName]:
 *
 * ```kotlin
 * val accounts = timedSuspend("repo.accounts.load") {
 *     accountRepository.observeAll(hid).first()
 * }
 * ```
 */
suspend fun <T> timedSuspend(
    metricName: String,
    category: MetricCategory = MetricCategory.DATA_ACCESS,
    block: suspend () -> T,
): T {
    val startNanos = System.nanoTime()
    return try {
        block()
    } finally {
        val durationMs = (System.nanoTime() - startNanos) / 1_000_000
        PerformanceTracker.record(metricName, durationMs, category)
    }
}

/**
 * Wraps a synchronous block with automatic performance timing.
 */
inline fun <T> timed(
    metricName: String,
    category: MetricCategory = MetricCategory.GENERAL,
    block: () -> T,
): T {
    val startNanos = System.nanoTime()
    return try {
        block()
    } finally {
        val durationMs = (System.nanoTime() - startNanos) / 1_000_000
        PerformanceTracker.record(metricName, durationMs, category)
    }
}

/**
 * Background service that periodically captures memory snapshots and
 * checks for performance budget violations.
 *
 * Start this during app initialization:
 * ```kotlin
 * PerformanceMonitor.start()
 * ```
 */
object PerformanceMonitor {

    private val logger: Logger = Logger.getLogger(PerformanceMonitor::class.java.name)

    /** Interval between memory snapshots. */
    private const val SNAPSHOT_INTERVAL_MS = 30_000L // 30 seconds

    /** Memory warning threshold in MB. */
    private const val MEMORY_WARNING_THRESHOLD_MB = 400L

    /** Cold start warning threshold in milliseconds. */
    const val COLD_START_WARNING_MS = 3000L

    /** Screen render warning threshold in milliseconds. */
    const val SCREEN_RENDER_WARNING_MS = 500L

    private var isRunning = false
    private var monitorScope: CoroutineScope? = null
    private var monitorJob: Job? = null

    /**
     * Starts the periodic background monitoring.
     */
    fun start() {
        if (monitorJob?.isActive == true) return
        isRunning = true

        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        monitorScope = scope
        monitorJob = scope.launch {
            logger.info("Performance monitor started")
            while (isActive && isRunning) {
                PerformanceTracker.captureMemorySnapshot()

                // Check for memory pressure
                val runtime = Runtime.getRuntime()
                val usedMb = (runtime.totalMemory() - runtime.freeMemory()) / (1024 * 1024)
                if (usedMb > MEMORY_WARNING_THRESHOLD_MB) {
                    logger.warning("High memory usage: ${usedMb}MB (threshold: ${MEMORY_WARNING_THRESHOLD_MB}MB)")
                }

                delay(SNAPSHOT_INTERVAL_MS)
            }
        }
    }

    /**
     * Stops the periodic background monitoring.
     */
    fun stop() {
        isRunning = false
        monitorScope?.cancel()
        monitorScope = null
        monitorJob = null
        logger.info("Performance monitor stopped")
    }
}
