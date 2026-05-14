// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.finance.desktop.di.koinGet
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.AlertSeverity
import com.finance.desktop.viewmodel.DiagnosticsViewModel
import com.finance.desktop.viewmodel.MetricCategorySummary
import com.finance.desktop.viewmodel.PerformanceAlert

// =============================================================================
// Diagnostics Screen — Performance monitoring dashboard
// =============================================================================

/**
 * Performance diagnostics screen for the desktop Finance application.
 *
 * Displays real-time APM metrics including:
 * - Cold start time and startup phase breakdown
 * - Per-category metric summaries (average, P95, max)
 * - Memory usage with heap utilization
 * - Performance alerts for budget violations
 * - Recent metric entries log
 *
 * Auto-refreshes every 5 seconds via [DiagnosticsViewModel].
 * Narrator reads all metric values and alert descriptions.
 */
@Composable
@Suppress("LongMethod") // Diagnostics display composable
fun DiagnosticsScreen(modifier: Modifier = Modifier) {
    val viewModel = koinGet<DiagnosticsViewModel>()
    val state by viewModel.uiState.collectAsState()

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Performance Diagnostics screen" },
        verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
    ) {
        // ── Header ──
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = "Performance Diagnostics",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.semantics {
                            heading()
                            contentDescription = "Performance Diagnostics heading"
                        },
                    )
                    Text(
                        text = "${state.totalMetricCount} metrics recorded · Auto-refreshing",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Button(
                    onClick = { viewModel.resetMetrics() },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                        contentColor = MaterialTheme.colorScheme.onErrorContainer,
                    ),
                    modifier = Modifier.semantics {
                        contentDescription = "Reset all performance metrics"
                    },
                ) {
                    Icon(Icons.Filled.Delete, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                    Text("Reset Metrics")
                }
            }
        }

        // ── Alerts ──
        if (state.alerts.isNotEmpty()) {
            item {
                Text(
                    text = "Performance Alerts",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics { heading() },
                )
            }
            items(state.alerts, key = { it.metricName }) { alert ->
                AlertCard(alert)
            }
        }

        // ── Startup + Memory summary row ──
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
            ) {
                StartupCard(
                    coldStartMs = state.coldStartMs,
                    phases = state.startupPhases,
                    modifier = Modifier.weight(1f),
                )
                MemoryCard(
                    latestMemory = state.latestMemory,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        // ── Category summaries ──
        item {
            Text(
                text = "Metric Categories",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
        }

        if (state.categorySummaries.isEmpty()) {
            item {
                Text(
                    text = "No metrics recorded yet. Navigate around the app to generate data.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            items(state.categorySummaries, key = { it.category.name }) { summary ->
                CategorySummaryCard(summary)
            }
        }

        // ── Recent metrics log ──
        item {
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            Text(
                text = "Recent Metrics (last 20)",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
        }

        items(state.recentMetrics, key = { "${it.name}-${it.timestampMs}" }) { metric ->
            MetricLogRow(metric)
        }
    }
}

// =============================================================================
// Sub-composables
// =============================================================================

@Composable
private fun AlertCard(alert: PerformanceAlert) {
    val containerColor = when (alert.severity) {
        AlertSeverity.CRITICAL -> MaterialTheme.colorScheme.errorContainer
        AlertSeverity.WARNING -> MaterialTheme.colorScheme.tertiaryContainer
    }
    val contentColor = when (alert.severity) {
        AlertSeverity.CRITICAL -> MaterialTheme.colorScheme.onErrorContainer
        AlertSeverity.WARNING -> MaterialTheme.colorScheme.onTertiaryContainer
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${alert.severity.displayName}: ${alert.message}"
            },
        colors = CardDefaults.cardColors(containerColor = containerColor),
    ) {
        Row(
            modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Filled.Warning,
                contentDescription = null,
                tint = contentColor,
                modifier = Modifier.size(20.dp),
            )
            Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = alert.severity.displayName,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = contentColor,
                )
                Text(
                    text = alert.message,
                    style = MaterialTheme.typography.bodySmall,
                    color = contentColor,
                )
            }
            Text(
                text = "${alert.actualMs}ms / ${alert.budgetMs}ms",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = contentColor,
            )
        }
    }
}

@Composable
private fun StartupCard(
    coldStartMs: Long,
    phases: List<com.finance.desktop.performance.StartupPhase>,
    modifier: Modifier = Modifier,
) {
    ElevatedCard(
        modifier = modifier.semantics {
            contentDescription = "Cold start time: ${coldStartMs} milliseconds"
        },
    ) {
        Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.Timer,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                Text(
                    text = "Startup",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
            Text(
                text = "${coldStartMs}ms",
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                color = if (coldStartMs > 3000) MaterialTheme.colorScheme.error
                else MaterialTheme.colorScheme.primary,
            )
            Text(
                text = "Cold start time",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (phases.isNotEmpty()) {
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
                phases.forEach { phase ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 2.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = phase.name,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            text = "${phase.durationMs}ms",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MemoryCard(
    latestMemory: com.finance.desktop.performance.MemorySnapshot?,
    modifier: Modifier = Modifier,
) {
    ElevatedCard(
        modifier = modifier.semantics {
            contentDescription = if (latestMemory != null) {
                "Memory usage: ${latestMemory.usedMb} of ${latestMemory.maxMb} megabytes"
            } else {
                "Memory: no data yet"
            }
        },
    ) {
        Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.Memory,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.secondary,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                Text(
                    text = "Memory",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

            if (latestMemory != null) {
                Text(
                    text = "${latestMemory.usedMb}MB",
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.Bold,
                    color = if (latestMemory.usedMb > 400) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.secondary,
                )
                Text(
                    text = "of ${latestMemory.maxMb}MB max heap",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
                val utilization = latestMemory.usedMb.toFloat() / latestMemory.maxMb.toFloat()
                LinearProgressIndicator(
                    progress = { utilization.coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth().height(8.dp),
                    color = if (utilization > 0.8f) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.secondary,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant,
                    strokeCap = StrokeCap.Round,
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
                Text(
                    text = "${(utilization * 100).toInt()}% heap utilization",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                Text(
                    text = "Waiting for data…",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun CategorySummaryCard(summary: MetricCategorySummary) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${summary.category.displayName}: " +
                    "${summary.count} samples, avg ${summary.averageMs}ms, P95 ${summary.p95Ms}ms"
            },
    ) {
        Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Filled.Speed,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                    Text(
                        text = summary.category.displayName,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                Text(
                    text = "${summary.count} samples",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                MetricStat("Avg", "${summary.averageMs}ms")
                MetricStat("P95", "${summary.p95Ms}ms")
                MetricStat("Max", "${summary.maxMs}ms")
            }
            if (summary.names.isNotEmpty()) {
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
                Text(
                    text = summary.names.joinToString(", "),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun MetricStat(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun MetricLogRow(metric: com.finance.desktop.performance.MetricEntry) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${metric.name}: ${metric.durationMs}ms (${metric.category.displayName})"
            },
        tonalElevation = 1.dp,
        shape = MaterialTheme.shapes.small,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(
                    horizontal = FinanceDesktopTheme.spacing.md,
                    vertical = FinanceDesktopTheme.spacing.sm,
                ),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = metric.name,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = metric.category.displayName,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                text = "${metric.durationMs}ms",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = if (metric.durationMs > 500) MaterialTheme.colorScheme.error
                else MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}
