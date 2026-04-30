// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.report

import android.content.res.Configuration
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import com.finance.core.report.GroupBy
import com.finance.core.report.PeriodGrouping
import com.finance.models.TransactionType
import org.koin.compose.viewmodel.koinViewModel

/**
 * Custom Report Builder screen (#1117).
 *
 * Provides report configuration with date range, filters, grouping options,
 * preview of generated report data, and PDF export. TalkBack accessible.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportBuilderScreen(
    onBack: () -> Unit = {},
    onPrintHtml: (String) -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: ReportBuilderViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Report Builder",
                        modifier = Modifier.semantics {
                            contentDescription = "Custom Report Builder"
                            heading()
                        },
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.semantics { contentDescription = "Navigate back" },
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
        modifier = modifier,
    ) { padding ->
        if (state.isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .semantics { contentDescription = "Loading report builder" },
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.semantics { contentDescription = "Loading" },
                )
            }
            return@Scaffold
        }

        // Export trigger
        state.exportHtml?.let { html ->
            onPrintHtml(html)
            viewModel.clearExportHtml()
        }

        ReportBuilderContent(
            state = state,
            onNameChange = viewModel::updateReportName,
            onStartDateClick = { viewModel.showDatePicker(true) },
            onEndDateClick = { viewModel.showDatePicker(false) },
            onGroupByChange = viewModel::updateGroupBy,
            onPeriodChange = viewModel::updatePeriodGrouping,
            onToggleType = viewModel::toggleTransactionType,
            onGenerate = viewModel::generateReport,
            onExport = viewModel::exportToPdf,
            modifier = Modifier.padding(padding),
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ReportBuilderContent(
    state: ReportBuilderUiState,
    onNameChange: (String) -> Unit,
    onStartDateClick: () -> Unit,
    onEndDateClick: () -> Unit,
    onGroupByChange: (GroupBy) -> Unit,
    onPeriodChange: (PeriodGrouping) -> Unit,
    onToggleType: (TransactionType) -> Unit,
    onGenerate: () -> Unit,
    onExport: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Report name
        item(key = "name") {
            OutlinedTextField(
                value = state.reportName,
                onValueChange = onNameChange,
                label = { Text("Report Name") },
                singleLine = true,
                leadingIcon = { Icon(Icons.Filled.Description, contentDescription = null) },
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Report name" },
            )
        }

        // Date range
        item(key = "dates") {
            Text(
                "Date Range",
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.semantics {
                    heading()
                    contentDescription = "Date range section"
                },
            )
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                FilledTonalButton(
                    onClick = onStartDateClick,
                    modifier = Modifier
                        .weight(1f)
                        .semantics {
                            contentDescription = "Start date: ${state.startDate ?: "Not set"}"
                        },
                ) {
                    Icon(Icons.Filled.CalendarMonth, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(state.startDate?.toString() ?: "Start Date")
                }
                FilledTonalButton(
                    onClick = onEndDateClick,
                    modifier = Modifier
                        .weight(1f)
                        .semantics {
                            contentDescription = "End date: ${state.endDate ?: "Not set"}"
                        },
                ) {
                    Icon(Icons.Filled.CalendarMonth, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(state.endDate?.toString() ?: "End Date")
                }
            }
        }

        // Group by chips
        item(key = "groupby") {
            Text(
                "Group By",
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.semantics {
                    heading()
                    contentDescription = "Grouping options"
                },
            )
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                GroupBy.entries.forEach { option ->
                    FilterChip(
                        selected = state.groupBy == option,
                        onClick = { onGroupByChange(option) },
                        label = { Text(option.name.lowercase().replaceFirstChar { it.uppercaseChar() }) },
                        modifier = Modifier.semantics {
                            contentDescription = "Group by ${option.name}"
                        },
                    )
                }
            }
        }

        // Period grouping (only when Group By = PERIOD)
        if (state.groupBy == GroupBy.PERIOD) {
            item(key = "period") {
                Text("Period Grouping", style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PeriodGrouping.entries.forEach { period ->
                        FilterChip(
                            selected = state.periodGrouping == period,
                            onClick = { onPeriodChange(period) },
                            label = { Text(period.name.lowercase().replaceFirstChar { it.uppercaseChar() }) },
                            modifier = Modifier.semantics {
                                contentDescription = "Period: ${period.name}"
                            },
                        )
                    }
                }
            }
        }

        // Transaction type filter chips
        item(key = "types") {
            Text(
                "Transaction Types",
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.semantics {
                    heading()
                    contentDescription = "Transaction type filters"
                },
            )
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TransactionType.entries.forEach { type ->
                    FilterChip(
                        selected = type in state.selectedTransactionTypes,
                        onClick = { onToggleType(type) },
                        label = { Text(type.name.lowercase().replaceFirstChar { it.uppercaseChar() }) },
                        modifier = Modifier.semantics {
                            contentDescription = "Filter by ${type.name}"
                        },
                    )
                }
            }
        }

        // Generate button
        item(key = "generate") {
            FilledTonalButton(
                onClick = onGenerate,
                enabled = !state.isGenerating,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Generate report" },
            ) {
                if (state.isGenerating) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Generating…")
                } else {
                    Icon(Icons.Filled.FilterList, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Generate Report")
                }
            }
        }

        // Report results
        if (state.report != null) {
            item(key = "summary") {
                ReportSummaryCard(
                    income = state.totalIncomeFormatted,
                    expenses = state.totalExpensesFormatted,
                    net = state.netAmountFormatted,
                    count = state.transactionCount,
                )
            }

            items(state.reportGroups, key = { it.label }) { group ->
                ReportGroupCard(group)
            }

            item(key = "export") {
                FilledTonalButton(
                    onClick = onExport,
                    enabled = !state.isExporting,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Export report as PDF" },
                ) {
                    Icon(Icons.Filled.PictureAsPdf, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(if (state.isExporting) "Exporting…" else "Export as PDF")
                }
            }
        }

        item(key = "spacer") { Spacer(Modifier.height(80.dp)) }
    }
}

@Composable
private fun ReportSummaryCard(
    income: String,
    expenses: String,
    net: String,
    count: Int,
) {
    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Report summary: Income $income, Expenses $expenses, Net $net, $count transactions"
            },
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Column(Modifier.padding(20.dp)) {
            Text(
                "Report Summary",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                SummaryItem("Income", income, Color(0xFF2E7D32))
                SummaryItem("Expenses", expenses, MaterialTheme.colorScheme.error)
                SummaryItem("Net", net, MaterialTheme.colorScheme.primary)
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "$count transactions",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f),
            )
        }
    }
}

@Composable
private fun SummaryItem(label: String, value: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, style = MaterialTheme.typography.labelSmall)
        Text(value, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = color)
    }
}

@Composable
private fun ReportGroupCard(group: ReportGroupUi) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${group.label}: ${group.totalFormatted}, ${group.count} transactions"
            },
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        group.label,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        "${group.count} transactions",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    group.totalFormatted,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                )
            }
            Spacer(Modifier.height(8.dp))
            LinearProgressIndicator(
                progress = { group.percentage.coerceIn(0f, 1f) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .semantics {
                        contentDescription = "${(group.percentage * 100).toInt()}% of total"
                    },
                trackColor = MaterialTheme.colorScheme.surfaceVariant,
                strokeCap = StrokeCap.Round,
            )
        }
    }
}

// ── Previews ─────────────────────────────────────────────────────────

@Preview(showBackground = true, name = "Report Builder - Light")
@Preview(showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES, name = "Report Builder - Dark")
@Composable
private fun ReportBuilderPreview() {
    FinanceTheme(dynamicColor = false) {
        ReportBuilderContent(
            state = ReportBuilderUiState(
                isLoading = false,
                reportName = "Monthly Summary",
                startDate = kotlinx.datetime.LocalDate(2025, 1, 1),
                endDate = kotlinx.datetime.LocalDate(2025, 1, 31),
                groupBy = GroupBy.CATEGORY,
                report = null,
            ),
            onNameChange = {},
            onStartDateClick = {},
            onEndDateClick = {},
            onGroupByChange = {},
            onPeriodChange = {},
            onToggleType = {},
            onGenerate = {},
            onExport = {},
        )
    }
}

@Preview(showBackground = true, name = "Report Results - Light")
@Preview(showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES, name = "Report Results - Dark")
@Composable
private fun ReportResultsPreview() {
    FinanceTheme(dynamicColor = false) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ReportSummaryCard("$3,200.00", "$2,100.00", "$1,100.00", 42)
            ReportGroupCard(ReportGroupUi("Groceries", "$450.00", 12, 0.35f))
            ReportGroupCard(ReportGroupUi("Dining", "$280.00", 8, 0.22f))
            ReportGroupCard(ReportGroupUi("Transport", "$190.00", 15, 0.15f))
        }
    }
}
