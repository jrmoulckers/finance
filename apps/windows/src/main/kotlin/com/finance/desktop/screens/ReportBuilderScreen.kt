// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import com.finance.desktop.viewmodel.DateRangePreset
import com.finance.desktop.viewmodel.GeneratedReport
import com.finance.desktop.viewmodel.ReportBuilderViewModel
import com.finance.desktop.viewmodel.ReportRow
import com.finance.desktop.viewmodel.ReportType

// =============================================================================
// Report Builder Screen — Configurable financial reports
// =============================================================================

/**
 * Custom Report Builder screen for the desktop Finance application.
 *
 * Two-panel layout: configuration on the left, report output on the right.
 *
 * ```
 * ┌──────────────────┬──────────────────────────┐
 * │  Config Panel     │  Report Output           │
 * │  - Report Type    │  - Title + Summary       │
 * │  - Date Range     │  - Data Rows             │
 * │  - Options        │  - Progress Bars         │
 * │  - Generate Btn   │                          │
 * └──────────────────┴──────────────────────────┘
 * ```
 *
 * Narrator reads report type, date range, and each data row with values.
 */
@Composable
fun ReportBuilderScreen(modifier: Modifier = Modifier) {
    val viewModel = koinGet<ReportBuilderViewModel>()
    val state by viewModel.uiState.collectAsState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Custom Report Builder screen" },
    ) {
        // ── Header ──
        Text(
            text = "Report Builder",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics {
                heading()
                contentDescription = "Report Builder heading"
            },
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
        Text(
            text = "Create custom financial reports with flexible filters",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        // ── Error banner ──
        state.errorMessage?.let { error ->
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.errorContainer,
            ) {
                Text(
                    text = error,
                    modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
                    color = MaterialTheme.colorScheme.onErrorContainer,
                )
            }
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
        }

        // ── Two-panel layout ──
        Row(
            modifier = Modifier.fillMaxSize(),
            horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xxl),
        ) {
            // Left: Config panel
            ConfigPanel(
                config = state.config,
                availableAccounts = state.availableAccounts,
                isLoading = state.isLoading,
                onReportTypeChanged = viewModel::updateReportType,
                onDateRangeChanged = viewModel::updateDateRange,
                onGroupByMonthChanged = viewModel::updateGroupByMonth,
                onIncludeSubcategoriesChanged = viewModel::updateIncludeSubcategories,
                onAccountToggled = viewModel::toggleAccountFilter,
                onGenerate = viewModel::generateReport,
                modifier = Modifier.width(320.dp).fillMaxHeight(),
            )

            // Right: Report output
            ReportOutputPanel(
                report = state.report,
                isLoading = state.isLoading,
                modifier = Modifier.weight(1f).fillMaxHeight(),
            )
        }
    }
}

// =============================================================================
// Config Panel
// =============================================================================

@Composable
private fun ConfigPanel(
    config: com.finance.desktop.viewmodel.ReportConfig,
    availableAccounts: List<Pair<String, String>>,
    isLoading: Boolean,
    onReportTypeChanged: (ReportType) -> Unit,
    onDateRangeChanged: (DateRangePreset) -> Unit,
    onGroupByMonthChanged: (Boolean) -> Unit,
    onIncludeSubcategoriesChanged: (Boolean) -> Unit,
    onAccountToggled: (String) -> Unit,
    onGenerate: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.medium,
        tonalElevation = 1.dp,
    ) {
        Column(
            modifier = Modifier
                .padding(FinanceDesktopTheme.spacing.lg)
                .verticalScroll(rememberScrollState()),
        ) {
            Text(
                text = "Configuration",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics {
                    heading()
                    contentDescription = "Report configuration"
                },
            )

            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

            // Report type dropdown
            Text(
                text = "Report Type",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            DropdownSelector(
                selected = config.reportType.displayName,
                options = ReportType.entries.map { it.displayName },
                onSelected = { name ->
                    ReportType.entries.find { it.displayName == name }
                        ?.let { onReportTypeChanged(it) }
                },
                accessibilityLabel = "Report type: ${config.reportType.displayName}",
            )

            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

            // Date range dropdown
            Text(
                text = "Date Range",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            DropdownSelector(
                selected = config.dateRangePreset.displayName,
                options = DateRangePreset.entries.map { it.displayName },
                onSelected = { name ->
                    DateRangePreset.entries.find { it.displayName == name }
                        ?.let { onDateRangeChanged(it) }
                },
                accessibilityLabel = "Date range: ${config.dateRangePreset.displayName}",
            )

            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

            // Options
            Text(
                text = "Options",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = config.includeSubcategories,
                    onCheckedChange = { onIncludeSubcategoriesChanged(it) },
                    modifier = Modifier.semantics {
                        contentDescription = "Include subcategories"
                    },
                )
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                Text("Include subcategories", style = MaterialTheme.typography.bodyMedium)
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = config.groupByMonth,
                    onCheckedChange = { onGroupByMonthChanged(it) },
                    modifier = Modifier.semantics {
                        contentDescription = "Group by month"
                    },
                )
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                Text("Group by month", style = MaterialTheme.typography.bodyMedium)
            }

            // Account filters
            if (availableAccounts.isNotEmpty()) {
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

                Text(
                    text = "Filter by Account",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Medium,
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))

                availableAccounts.forEach { (id, name) ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(
                            checked = config.selectedAccountIds.isEmpty() || id in config.selectedAccountIds,
                            onCheckedChange = { onAccountToggled(id) },
                            modifier = Modifier.semantics {
                                contentDescription = "Filter account: $name"
                            },
                        )
                        Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                        Text(name, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }

            Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

            // Generate button
            Button(
                onClick = onGenerate,
                enabled = !isLoading,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription = "Generate ${config.reportType.displayName} report"
                    },
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                    )
                } else {
                    Icon(Icons.Filled.PlayArrow, contentDescription = null)
                }
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                Text("Generate Report")
            }
        }
    }
}

// =============================================================================
// Report Output Panel
// =============================================================================

@Composable
private fun ReportOutputPanel(
    report: GeneratedReport?,
    isLoading: Boolean,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.medium,
        tonalElevation = 1.dp,
    ) {
        when {
            isLoading -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(
                            modifier = Modifier.semantics {
                                contentDescription = "Generating report"
                            },
                        )
                        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                        Text(
                            "Generating report…",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
            }
            report == null -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Filled.Assessment,
                            contentDescription = null,
                            modifier = Modifier.size(64.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                        Text(
                            "Configure and generate a report",
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.semantics {
                                contentDescription = "No report generated yet"
                            },
                        )
                        Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
                        Text(
                            "Select options on the left and click Generate",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            else -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(FinanceDesktopTheme.spacing.lg),
                ) {
                    // Report header
                    ReportHeader(report)
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

                    // Summary cards
                    if (report.summaryItems.isNotEmpty()) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.md),
                        ) {
                            report.summaryItems.forEach { (label, value) ->
                                SummaryChip(label, value, modifier = Modifier.weight(1f))
                            }
                        }
                        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                    }

                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

                    // Data rows
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
                    ) {
                        items(report.rows, key = { it.label }) { row ->
                            ReportRowCard(row)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ReportHeader(report: GeneratedReport) {
    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${report.title}: total ${report.totalFormatted}"
            },
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Column(
            modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
        ) {
            Text(
                text = report.title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
            Text(
                text = report.subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f),
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
            Text(
                text = report.totalFormatted,
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
        }
    }
}

@Composable
private fun SummaryChip(label: String, value: String, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier.semantics { contentDescription = "$label: $value" },
    ) {
        Column(
            modifier = Modifier.padding(FinanceDesktopTheme.spacing.md),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun ReportRowCard(row: ReportRow) {
    val animatedProgress by animateFloatAsState(
        targetValue = row.percentage.coerceIn(0f, 1f),
        animationSpec = tween(600),
        label = "report-row-${row.label}",
    )
    val percentDisplay = "${(row.percentage * 100).toInt()}%"

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${row.label}: ${row.value}, $percentDisplay"
            },
    ) {
        Column(
            modifier = Modifier.padding(FinanceDesktopTheme.spacing.md),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = row.label,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.weight(1f),
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = percentDisplay,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = row.value,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            LinearProgressIndicator(
                progress = { animatedProgress },
                modifier = Modifier.fillMaxWidth().height(6.dp),
                color = MaterialTheme.colorScheme.primary,
                trackColor = MaterialTheme.colorScheme.surfaceVariant,
                strokeCap = StrokeCap.Round,
            )
        }
    }
}

// =============================================================================
// Dropdown Selector helper
// =============================================================================

@Composable
private fun DropdownSelector(
    selected: String,
    options: List<String>,
    onSelected: (String) -> Unit,
    accessibilityLabel: String,
) {
    var expanded by remember { mutableStateOf(false) }

    Box {
        OutlinedButton(
            onClick = { expanded = true },
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = accessibilityLabel },
        ) {
            Text(selected, modifier = Modifier.weight(1f))
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option) },
                    onClick = {
                        onSelected(option)
                        expanded = false
                    },
                    modifier = Modifier.semantics {
                        contentDescription = option
                    },
                )
            }
        }
    }
}
