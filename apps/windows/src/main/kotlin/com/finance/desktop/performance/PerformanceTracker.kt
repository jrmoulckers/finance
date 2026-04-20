// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.performance

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.logging.Logger

/**
 * Lightweight APM (Application Performance Monitoring) tracker for the
 * Finance Windows desktop client.
 *
 * Captures and stores performance metrics including:
 * - **Startup timing**: cold-start and per-phase breakdown
 * - **Screen render timing**: first render and recomposition counts
 * - **Repository latency**: time for data-access operations
 * - **Memory snapshots**: JVM heap usage over time
 * - **Frame rate**: approximate composition frame durations
 *
 * All metrics are stored in memory with configurable retention (default
 * 500 entries). No data leaves the device — this is a debug/diagnostics
 * tool surfaced in the Settings → Diagnostics screen.
 *
 * ## Thread Safety
 *
 * Uses [ConcurrentHashMap] and [CopyOnWriteArrayList] for lock-free
 * concurrent access from UI, IO, and Default coroutine dispatchers.
 *
 * ## Usage
 *
 * ```kotlin
 * PerformanceTracker.markStart("screen.dashboard.render")
 * // … compose the screen …
 * PerformanceTracker.markEnd("screen.dashboard.render")
 * ```
 */
object PerformanceTracker {

    private val logger: Logger = Logger.getLogger(PerformanceTracker::class.java.name)

    /** Maximum number of metric entries retained in memory. */
    private const val MAX_ENTRIES = 500

    /** Pending start timestamps keyed by span name. */
    private val pendingSpans = ConcurrentHashMap<String, Long>()

    /** Completed metric entries. */
    private val _metrics = CopyOnWriteArrayList<MetricEntry>()

    /** Startup phase timings. */
    private val _startupPhases = CopyOnWriteArrayList<StartupPhase>()

    /** Memory snapshots over time. */
    private val _memorySnapshots = CopyOnWriteArrayList<MemorySnapshot>()

    /** Application cold-start timestamp (set once). */
    private var appStartTimeMs: Long = 0L

    /** Time when the first screen became interactive. */
    private var firstInteractiveTimeMs: Long = 0L

    /**
     * Call once at the very beginning of `main()` to record the cold-start
     * baseline timestamp.
     */
    fun recordAppStart() {
        appStartTimeMs = System.currentTimeMillis()
        logger.fine("App start recorded at $appStartTimeMs")
    }

    /**
     * Call when the first screen has rendered and is interactive.
     */
    fun recordFirstInteractive() {
        firstInteractiveTimeMs = System.currentTimeMillis()
        val coldStartMs = firstInteractiveTimeMs - appStartTimeMs
        addMetric(MetricEntry("app.cold_start", coldStartMs, MetricCategory.STARTUP))
        logger.fine("First interactive in ${coldStartMs}ms")
    }

    /**
     * Records a named startup phase with its duration.
     */
    fun recordStartupPhase(name: String, durationMs: Long) {
        _startupPhases.add(StartupPhase(name, durationMs))
        addMetric(MetricEntry("startup.$name", durationMs, MetricCategory.STARTUP))
    }

    /**
     * Marks the beginning of a timed span.
     */
    fun markStart(spanName: String) {
        pendingSpans[spanName] = System.nanoTime()
    }

    /**
     * Marks the end of a timed span and records the duration.
     */
    fun markEnd(spanName: String, category: MetricCategory = MetricCategory.RENDER) {
        val startNanos = pendingSpans.remove(spanName) ?: return
        val durationMs = (System.nanoTime() - startNanos) / 1_000_000
        addMetric(MetricEntry(spanName, durationMs, category))
    }

    /**
     * Records a pre-computed duration metric.
     */
    fun record(name: String, durationMs: Long, category: MetricCategory = MetricCategory.GENERAL) {
        addMetric(MetricEntry(name, durationMs, category))
    }

    /**
     * Captures a snapshot of current JVM memory usage.
     */
    fun captureMemorySnapshot() {
        val runtime = Runtime.getRuntime()
        val snapshot = MemorySnapshot(
            timestampMs = System.currentTimeMillis(),
            usedMb = (runtime.totalMemory() - runtime.freeMemory()) / (1024 * 1024),
            totalMb = runtime.totalMemory() / (1024 * 1024),
            maxMb = runtime.maxMemory() / (1024 * 1024),
        )
        _memorySnapshots.add(snapshot)
        if (_memorySnapshots.size > MAX_ENTRIES) {
            _memorySnapshots.removeAt(0)
        }
    }

    // ── Query API ──────────────────────────────────────────────────────────

    /** All recorded metrics. */
    val metrics: List<MetricEntry> get() = _metrics.toList()

    /** Startup phase breakdown. */
    val startupPhases: List<StartupPhase> get() = _startupPhases.toList()

    /** Memory usage over time. */
    val memorySnapshots: List<MemorySnapshot> get() = _memorySnapshots.toList()

    /** Cold-start duration in milliseconds (0 if not yet recorded). */
    val coldStartMs: Long
        get() = if (firstInteractiveTimeMs > 0 && appStartTimeMs > 0) {
            firstInteractiveTimeMs - appStartTimeMs
        } else {
            0L
        }

    /** Average duration for a named metric across all samples. */
    fun averageMs(name: String): Long {
        val matching = _metrics.filter { it.name == name }
        return if (matching.isNotEmpty()) matching.map { it.durationMs }.average().toLong() else 0L
    }

    /** P95 duration for a named metric. */
    fun p95Ms(name: String): Long {
        val sorted = _metrics.filter { it.name == name }.map { it.durationMs }.sorted()
        return if (sorted.isNotEmpty()) sorted[(sorted.size * 0.95).toInt().coerceAtMost(sorted.size - 1)] else 0L
    }

    /** All unique metric names. */
    fun metricNames(): Set<String> = _metrics.map { it.name }.toSet()

    /** Clears all recorded metrics (for diagnostics reset). */
    fun reset() {
        _metrics.clear()
        _startupPhases.clear()
        _memorySnapshots.clear()
        pendingSpans.clear()
        logger.info("Performance metrics reset")
    }

    private fun addMetric(entry: MetricEntry) {
        _metrics.add(entry)
        if (_metrics.size > MAX_ENTRIES) {
            _metrics.removeAt(0)
        }
    }
}

/**
 * A single performance metric data point.
 */
data class MetricEntry(
    val name: String,
    val durationMs: Long,
    val category: MetricCategory,
    val timestampMs: Long = System.currentTimeMillis(),
)

/**
 * Categories for organizing metrics.
 */
enum class MetricCategory(val displayName: String) {
    STARTUP("Startup"),
    RENDER("Screen Render"),
    DATA_ACCESS("Data Access"),
    SYNC("Sync"),
    GENERAL("General"),
}

/**
 * A named phase during application startup.
 */
data class StartupPhase(
    val name: String,
    val durationMs: Long,
)

/**
 * A snapshot of JVM memory usage at a point in time.
 */
data class MemorySnapshot(
    val timestampMs: Long,
    val usedMb: Long,
    val totalMb: Long,
    val maxMb: Long,
)
