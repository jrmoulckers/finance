// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.performance.MemorySnapshot
import com.finance.desktop.performance.MetricCategory
import com.finance.desktop.performance.MetricEntry
import com.finance.desktop.performance.PerformanceMonitor
import com.finance.desktop.performance.PerformanceTracker
import com.finance.desktop.performance.StartupPhase
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Summary statistics for a metric category.
 */
data class MetricCategorySummary(
    val category: MetricCategory,
    val count: Int,
    val averageMs: Long,
    val p95Ms: Long,
    val maxMs: Long,
    val names: List<String>,
)

/**
 * A performance alert indicating a budget violation.
 */
data class PerformanceAlert(
    val severity: AlertSeverity,
    val message: String,
    val metricName: String,
    val actualMs: Long,
    val budgetMs: Long,
)

enum class AlertSeverity(val displayName: String) {
    WARNING("Warning"),
    CRITICAL("Critical"),
}

/**
 * UI state for the performance diagnostics screen.
 */
data class DiagnosticsUiState(
    val coldStartMs: Long = 0L,
    val startupPhases: List<StartupPhase> = emptyList(),
    val categorySummaries: List<MetricCategorySummary> = emptyList(),
    val recentMetrics: List<MetricEntry> = emptyList(),
    val latestMemory: MemorySnapshot? = null,
    val memoryHistory: List<MemorySnapshot> = emptyList(),
    val alerts: List<PerformanceAlert> = emptyList(),
    val totalMetricCount: Int = 0,
)

/**
 * ViewModel for the Performance Diagnostics screen.
 *
 * Periodically polls [PerformanceTracker] for updated metrics and
 * computes summary statistics, alerts, and memory usage data.
 * Refresh interval is 5 seconds to keep the dashboard up to date
 * without excessive CPU usage.
 */
class DiagnosticsViewModel : DesktopViewModel() {

    private val _uiState = MutableStateFlow(DiagnosticsUiState())
    val uiState: StateFlow<DiagnosticsUiState> = _uiState.asStateFlow()

    init {
        startPolling()
    }

    fun resetMetrics() {
        PerformanceTracker.reset()
        refreshState()
    }

    private fun startPolling() {
        viewModelScope.launch {
            while (isActive) {
                refreshState()
                delay(5_000)
            }
        }
    }

    private fun refreshState() {
        val metrics = PerformanceTracker.metrics
        val memorySnapshots = PerformanceTracker.memorySnapshots

        // Category summaries
        val categorySummaries = MetricCategory.entries.mapNotNull { category ->
            val categoryMetrics = metrics.filter { it.category == category }
            if (categoryMetrics.isEmpty()) return@mapNotNull null

            val names = categoryMetrics.map { it.name }.distinct()
            val durations = categoryMetrics.map { it.durationMs }

            MetricCategorySummary(
                category = category,
                count = categoryMetrics.size,
                averageMs = durations.average().toLong(),
                p95Ms = durations.sorted().let { sorted ->
                    sorted[(sorted.size * 0.95).toInt().coerceAtMost(sorted.size - 1)]
                },
                maxMs = durations.max(),
                names = names,
            )
        }

        // Performance alerts
        val alerts = mutableListOf<PerformanceAlert>()

        val coldStartMs = PerformanceTracker.coldStartMs
        if (coldStartMs > PerformanceMonitor.COLD_START_WARNING_MS) {
            alerts.add(
                PerformanceAlert(
                    severity = if (coldStartMs > 5000) AlertSeverity.CRITICAL else AlertSeverity.WARNING,
                    message = "Cold start took ${coldStartMs}ms (budget: ${PerformanceMonitor.COLD_START_WARNING_MS}ms)",
                    metricName = "app.cold_start",
                    actualMs = coldStartMs,
                    budgetMs = PerformanceMonitor.COLD_START_WARNING_MS,
                ),
            )
        }

        // Check screen render times
        PerformanceTracker.metricNames()
            .filter { it.startsWith("screen.") && it.endsWith(".first_render") }
            .forEach { name ->
                val avg = PerformanceTracker.averageMs(name)
                if (avg > PerformanceMonitor.SCREEN_RENDER_WARNING_MS) {
                    alerts.add(
                        PerformanceAlert(
                            severity = AlertSeverity.WARNING,
                            message = "$name averages ${avg}ms (budget: ${PerformanceMonitor.SCREEN_RENDER_WARNING_MS}ms)",
                            metricName = name,
                            actualMs = avg,
                            budgetMs = PerformanceMonitor.SCREEN_RENDER_WARNING_MS,
                        ),
                    )
                }
            }

        _uiState.value = DiagnosticsUiState(
            coldStartMs = coldStartMs,
            startupPhases = PerformanceTracker.startupPhases,
            categorySummaries = categorySummaries,
            recentMetrics = metrics.takeLast(20).reversed(),
            latestMemory = memorySnapshots.lastOrNull(),
            memoryHistory = memorySnapshots.takeLast(20),
            alerts = alerts,
            totalMetricCount = metrics.size,
        )
    }
}
