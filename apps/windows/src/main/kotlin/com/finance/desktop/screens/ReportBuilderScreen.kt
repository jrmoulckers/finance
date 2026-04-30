// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.finance.desktop.di.koinGet
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.DateRangePreset
import com.finance.desktop.viewmodel.ExportFormat
import com.finance.desktop.viewmodel.ReportBuilderUiState
import com.finance.desktop.viewmodel.ReportBuilderViewModel
import com.finance.desktop.viewmodel.ReportPreviewRow
import com.finance.desktop.viewmodel.ReportSummary
import com.finance.desktop.viewmodel.ReportType

// =============================================================================
// Custom Report Builder Screen — Sprint 20 (#303)
// =============================================================================

/**
 * Custom Report Builder with a side-by-side configuration + preview layout.
 *
 * Left pane: Report type, date range, account filter, export format.
 * Right pane: Preview table with generated report data and summary statistics.
 *
 * Narrator reads report configuration, preview data, and export status.
 * High contrast colours adapt via [MaterialTheme.colorScheme].
 */
@Composable
fun ReportBuilderScreen(modifier: Modifier = Modifier) {
    val viewModel = koinGet<ReportBuilderViewModel>()
    val state by viewModel.uiState.collectAsState()

    Row(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Custom Report Builder screen" },
    ) {
        // ── Left: Configuration panel ──
        ReportConfigPanel(
            state = state,
            onReportTypeChange = viewModel::setReportType,
            onDatePresetChange = viewModel::setDateRangePreset,
            onStartDateChange = viewModel::setStartDate,
            onEndDateChange = viewModel::setEndDate,
            onToggleAccount = viewModel::toggleAccountSelection,
            onToggleTransfers = viewModel::toggleIncludeTransfers,
            onExportFormatChange = viewModel::setExportFormat,
            onGenerate = viewModel::generatePreview,
            onExport = viewModel::exportReport,
            modifier = Modifier
                .width(360.dp)
                .fillMaxHeight(),
        )

        VerticalDivider(
            modifier = Modifier
                .fillMaxHeight()
                .padding(horizontal = FinanceDesktopTheme.spacing.md),
            color = MaterialTheme.colorScheme.outlineVariant,
        )

        // ── Right: Preview pane ──
        ReportPreviewPanel(
            state = state,
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight(),
        )
    }
}

// ─── Configuration panel ─────────────────────────────────────────────────────

@Composable
private fun ReportConfigPanel(
    state: ReportBuilderUiState,
    onReportTypeChange: (ReportType) -> Unit,
    onDatePresetChange: (DateRangePreset) -> Unit,
    onStartDateChange: (String) -> Unit,
    onEndDateChange: (String) -> Unit,
    onToggleAccount: (String) -> Unit,
    onToggleTransfers: () -> Unit,
    onExportFormatChange: (ExportFormat) -> Unit,
    onGenerate: () -> Unit,
    onExport: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
    ) {
        item {
            Text(
                text = "Report Builder",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics {
                    heading()
                    contentDescription = "Report Builder configuration"
                },
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            Text(
                text = "Configure and generate custom financial reports",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        // Report type
        item {
            SectionHeader("Report Type")
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                ReportType.entries.forEach { type ->
                    val label = type.name.replace('_', ' ').lowercase()
                        .split(' ').joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onReportTypeChange(type) }
                            .padding(vertical = 4.dp)
                            .semantics {
                                role = Role.RadioButton
                                selected = state.reportType == type
                                contentDescription = "$label report type"
                            },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(
                            selected = state.reportType == type,
                            onClick = { onReportTypeChange(type) },
                        )
                        Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                        Text(text = label, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }

        // Date range
        item {
            SectionHeader("Date Range")
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            FlowRow(
                horizontalSpacing = FinanceDesktopTheme.spacing.sm,
                verticalSpacing = FinanceDesktopTheme.spacing.sm,
            ) {
                DateRangePreset.entries.forEach { preset ->
                    val label = preset.name.replace('_', ' ').lowercase()
                        .split(' ').joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }
                    FilterChip(
                        selected = state.dateRangePreset == preset,
                        onClick = { onDatePresetChange(preset) },
                        label = { Text(label) },
                        modifier = Modifier.semantics {
                            contentDescription = "$label date range"
                        },
                    )
                }
            }
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
            ) {
                OutlinedTextField(
                    value = state.startDate,
                    onValueChange = onStartDateChange,
                    label = { Text("Start") },
                    singleLine = true,
                    modifier = Modifier
                        .weight(1f)
                        .semantics { contentDescription = "Start date: ${state.startDate}" },
                )
                OutlinedTextField(
                    value = state.endDate,
                    onValueChange = onEndDateChange,
                    label = { Text("End") },
                    singleLine = true,
                    modifier = Modifier
                        .weight(1f)
                        .semantics { contentDescription = "End date: ${state.endDate}" },
                )
            }
        }

        // Account filter
        item {
            SectionHeader("Accounts")
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            state.availableAccounts.forEach { (id, name) ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onToggleAccount(id) }
                        .padding(vertical = 2.dp)
                        .semantics {
                            role = Role.Checkbox
                            contentDescription = "$name account filter"
                        },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(
                        checked = id in state.selectedAccountIds,
                        onCheckedChange = { onToggleAccount(id) },
                    )
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                    Text(text = name, style = MaterialTheme.typography.bodyMedium)
                }
            }
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onToggleTransfers() }
                    .semantics {
                        role = Role.Checkbox
                        contentDescription = "Include transfers"
                    },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(
                    checked = state.includeTransfers,
                    onCheckedChange = { onToggleTransfers() },
                )
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                Text(text = "Include transfers", style = MaterialTheme.typography.bodyMedium)
            }
        }

        // Export format
        item {
            SectionHeader("Export Format")
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            Row(horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm)) {
                ExportFormat.entries.forEach { format ->
                    FilterChip(
                        selected = state.exportFormat == format,
                        onClick = { onExportFormatChange(format) },
                        label = { Text(format.name) },
                        leadingIcon = {
                            Icon(
                                if (format == ExportFormat.PDF) Icons.Filled.PictureAsPdf
                                else Icons.Filled.TableChart,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                            )
                        },
                        modifier = Modifier.semantics {
                            contentDescription = "Export as ${format.name}"
                        },
                    )
                }
            }
        }

        // Action buttons
        item {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
            ) {
                Button(
                    onClick = onGenerate,
                    enabled = !state.isLoading,
                    modifier = Modifier
                        .weight(1f)
                        .semantics {
                            contentDescription = "Generate report preview"
                            role = Role.Button
                        },
                ) {
                    if (state.isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Icon(Icons.Filled.Refresh, contentDescription = null)
                    }
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                    Text("Generate")
                }
                OutlinedButton(
                    onClick = onExport,
                    enabled = state.isPreviewReady && !state.isExporting,
                    modifier = Modifier
                        .weight(1f)
                        .semantics {
                            contentDescription = "Export report as ${state.exportFormat.name}"
                            role = Role.Button
                        },
                ) {
                    if (state.isExporting) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                        )
                    } else if (state.exportSuccess) {
                        Icon(Icons.Filled.Check, contentDescription = null)
                    } else {
                        Icon(Icons.Filled.Download, contentDescription = null)
                    }
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                    Text(
                        when {
                            state.isExporting -> "Exporting…"
                            state.exportSuccess -> "Exported!"
                            else -> "Export ${state.exportFormat.name}"
                        },
                    )
                }
            }
        }
    }
}

// ─── Preview panel ───────────────────────────────────────────────────────────

@Composable
private fun ReportPreviewPanel(
    state: ReportBuilderUiState,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.padding(start = FinanceDesktopTheme.spacing.md)) {
        Text(
            text = "Report Preview",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics {
                heading()
                contentDescription = "Report Preview"
            },
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

        if (!state.isPreviewReady) {
            // Empty state
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = Icons.Filled.Assessment,
                        contentDescription = null,
                        modifier = Modifier.size(64.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                    Text(
                        text = "Configure your report and click Generate",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.semantics {
                            contentDescription = "No report preview yet. Configure and generate."
                        },
                    )
                }
            }
        } else {
            // Summary cards
            state.summary?.let { summary ->
                ReportSummaryCards(summary)
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))
            }

            // Data table
            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
            ) {
                // Table header
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                MaterialTheme.colorScheme.surfaceVariant,
                                RoundedCornerShape(topStart = 8.dp, topEnd = 8.dp),
                            )
                            .padding(
                                horizontal = FinanceDesktopTheme.spacing.lg,
                                vertical = FinanceDesktopTheme.spacing.md,
                            ),
                    ) {
                        Text(
                            "Category",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            "Amount",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.width(120.dp),
                        )
                        Text(
                            "Share",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.width(160.dp),
                        )
                    }
                }
                items(state.previewRows) { row ->
                    ReportDataRow(row)
                }
            }
        }
    }
}

// ─── Summary cards ───────────────────────────────────────────────────────────

@Composable
private fun ReportSummaryCards(summary: ReportSummary) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
    ) {
        SummaryCard("Income", summary.totalIncome, Color(0xFF2E7D32), Modifier.weight(1f))
        SummaryCard("Expenses", summary.totalExpenses, MaterialTheme.colorScheme.error, Modifier.weight(1f))
        SummaryCard("Net", summary.netAmount, MaterialTheme.colorScheme.primary, Modifier.weight(1f))
        SummaryCard("Transactions", "${summary.transactionCount}", MaterialTheme.colorScheme.tertiary, Modifier.weight(1f))
    }
}

@Composable
private fun SummaryCard(
    label: String,
    value: String,
    color: Color,
    modifier: Modifier = Modifier,
) {
    ElevatedCard(
        modifier = modifier.semantics {
            contentDescription = "$label: $value"
        },
    ) {
        Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg)) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = color,
            )
        }
    }
}

// ─── Data row ────────────────────────────────────────────────────────────────

@Composable
private fun ReportDataRow(row: ReportPreviewRow) {
    val color = if (row.isIncome) Color(0xFF2E7D32) else MaterialTheme.colorScheme.error
    val pct = (row.percentage * 100).toInt()

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${row.label}: ${row.amount}, $pct percent of total"
            },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(
                    horizontal = FinanceDesktopTheme.spacing.lg,
                    vertical = FinanceDesktopTheme.spacing.md,
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Category name
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = if (row.isIncome) Icons.AutoMirrored.Filled.TrendingUp
                    else Icons.AutoMirrored.Filled.TrendingDown,
                    contentDescription = null,
                    tint = color,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                Text(
                    text = row.label,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            // Amount
            Text(
                text = row.amount,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = color,
                modifier = Modifier.width(120.dp),
            )
            // Progress bar
            Row(
                modifier = Modifier.width(160.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                LinearProgressIndicator(
                    progress = { row.percentage.coerceIn(0f, 1f) },
                    modifier = Modifier
                        .weight(1f)
                        .height(6.dp),
                    color = color,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant,
                    strokeCap = StrokeCap.Round,
                )
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                Text(
                    text = "$pct%",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = color,
                )
            }
        }
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.semantics {
            heading()
            contentDescription = "$title section"
        },
    )
}

/**
 * Simple flow-row layout that wraps children horizontally.
 * Compose Desktop doesn't ship FlowRow yet; this approximates it with Column+Row.
 */
@Composable
private fun FlowRow(
    horizontalSpacing: androidx.compose.ui.unit.Dp = 0.dp,
    verticalSpacing: androidx.compose.ui.unit.Dp = 0.dp,
    content: @Composable () -> Unit,
) {
    // Use built-in Compose flow layout when available.
    // For now, wrap in a simple Column that places items in rows.
    Column(verticalArrangement = Arrangement.spacedBy(verticalSpacing)) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(horizontalSpacing),
            modifier = Modifier.fillMaxWidth(),
        ) {
            content()
        }
    }
}
