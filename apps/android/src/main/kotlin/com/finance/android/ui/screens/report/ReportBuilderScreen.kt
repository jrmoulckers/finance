// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.report

import android.content.res.Configuration
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.BookmarkAdd
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.ShowChart
import androidx.compose.material.icons.filled.TableChart
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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
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

/** Chart color palette for report visualizations (#1112). */
private val chartColors = listOf(
    Color(0xFF1565C0), Color(0xFF2E7D32), Color(0xFFFF9800),
    Color(0xFFE91E63), Color(0xFF9C27B0), Color(0xFF00BCD4),
    Color(0xFFFF5722), Color(0xFF607D8B), Color(0xFF795548),
    Color(0xFF4CAF50),
)

/**
 * Enhanced Custom Report Builder screen (#1112).
 *
 * Provides template-based report creation, preset date ranges,
 * category/account multi-select filters, chart rendering (bar/line/pie),
 * PDF+CSV export, saved reports list, and scheduled report toggle.
 * Full TalkBack accessibility with WCAG 2.2 AA compliance.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportBuilderScreen(
    onBack: () -> Unit = {},
    onPrintHtml: (String) -> Unit = {},
    onShareCsv: (String) -> Unit = {},
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
                actions = {
                    // Saved reports toggle
                    IconButton(
                        onClick = viewModel::toggleSavedReports,
                        modifier = Modifier.semantics { contentDescription = "View saved reports" },
                    ) {
                        Icon(Icons.Filled.Folder, contentDescription = null)
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

        // Export triggers
        state.exportHtml?.let { html ->
            onPrintHtml(html)
            viewModel.clearExportHtml()
        }
        state.exportCsv?.let { csv ->
            onShareCsv(csv)
            viewModel.clearExportCsv()
        }

        ReportBuilderContent(
            state = state,
            onTemplateSelected = viewModel::selectTemplate,
            onShowTemplatePicker = viewModel::showTemplatePicker,
            onNameChange = viewModel::updateReportName,
            onDatePresetSelected = viewModel::selectDatePreset,
            onStartDateClick = { viewModel.showDatePicker(true) },
            onEndDateClick = { viewModel.showDatePicker(false) },
            onGroupByChange = viewModel::updateGroupBy,
            onPeriodChange = viewModel::updatePeriodGrouping,
            onChartTypeChange = viewModel::updateChartType,
            onToggleType = viewModel::toggleTransactionType,
            onToggleCategory = viewModel::toggleCategory,
            onToggleCategoryFilter = viewModel::toggleCategoryFilter,
            onToggleAccount = viewModel::toggleAccount,
            onToggleAccountFilter = viewModel::toggleAccountFilter,
            onToggleScheduled = viewModel::toggleScheduled,
            onGenerate = viewModel::generateReport,
            onExportPdf = viewModel::exportToPdf,
            onExportCsv = viewModel::exportToCsv,
            onSaveReport = viewModel::saveCurrentReport,
            onLoadSavedReport = viewModel::loadSavedReport,
            onDeleteSavedReport = viewModel::deleteSavedReport,
            modifier = Modifier.padding(padding),
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
@Suppress("LongMethod", "CyclomaticComplexMethod") // Complex Compose UI function with cohesive layout logic
internal fun ReportBuilderContent(
    state: ReportBuilderUiState,
    onTemplateSelected: (ReportTemplate) -> Unit,
    onShowTemplatePicker: () -> Unit,
    onNameChange: (String) -> Unit,
    onDatePresetSelected: (DateRangePreset) -> Unit,
    onStartDateClick: () -> Unit,
    onEndDateClick: () -> Unit,
    onGroupByChange: (GroupBy) -> Unit,
    onPeriodChange: (PeriodGrouping) -> Unit,
    onChartTypeChange: (ChartType) -> Unit,
    onToggleType: (TransactionType) -> Unit,
    onToggleCategory: (com.finance.models.types.SyncId) -> Unit,
    onToggleCategoryFilter: () -> Unit,
    onToggleAccount: (com.finance.models.types.SyncId) -> Unit,
    onToggleAccountFilter: () -> Unit,
    onToggleScheduled: () -> Unit,
    onGenerate: () -> Unit,
    onExportPdf: () -> Unit,
    onExportCsv: () -> Unit,
    onSaveReport: () -> Unit,
    onLoadSavedReport: (SavedReport) -> Unit,
    onDeleteSavedReport: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // ── Saved reports panel (#1112) ─────────────────────────────
        if (state.showSavedReports && state.savedReports.isNotEmpty()) {
            item(key = "saved-header") {
                Text(
                    "Saved Reports",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics {
                        heading()
                        contentDescription = "Saved reports section"
                    },
                )
            }
            items(state.savedReports, key = { it.id }) { saved ->
                SavedReportCard(
                    saved = saved,
                    onLoad = { onLoadSavedReport(saved) },
                    onDelete = { onDeleteSavedReport(saved.id) },
                )
            }
        }

        // ── Template picker (#1112) ─────────────────────────────────
        if (state.showTemplatePicker) {
            item(key = "template-header") {
                Text(
                    "Choose a Template",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics {
                        heading()
                        contentDescription = "Report template selection"
                    },
                )
            }

            items(ReportTemplate.entries.toList(), key = { it.name }) { template ->
                TemplateCard(
                    template = template,
                    isSelected = state.selectedTemplate == template,
                    onClick = { onTemplateSelected(template) },
                )
            }
        }

        // ── Report configuration (shown after template selected) ────
        if (!state.showTemplatePicker) {
            // Change template link
            item(key = "change-template") {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "Template: ${state.selectedTemplate.displayName}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .clickable(
                                onClickLabel = "Change template",
                                onClick = onShowTemplatePicker,
                            )
                            .semantics {
                                contentDescription = "Current template: ${state.selectedTemplate.displayName}. Tap to change."
                            },
                    )
                    // Scheduled toggle (#1112)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Filled.Schedule,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            "Scheduled",
                            style = MaterialTheme.typography.labelSmall,
                        )
                        Spacer(Modifier.width(4.dp))
                        Switch(
                            checked = state.isScheduled,
                            onCheckedChange = { onToggleScheduled() },
                            modifier = Modifier.semantics {
                                contentDescription = if (state.isScheduled) {
                                    "Scheduled report generation is on. Tap to turn off."
                                } else {
                                    "Scheduled report generation is off. Tap to turn on."
                                }
                            },
                        )
                    }
                }
            }

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

            // Date range presets (#1112)
            item(key = "date-presets") {
                Text(
                    "Date Range",
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.semantics {
                        heading()
                        contentDescription = "Date range section"
                    },
                )
                Spacer(Modifier.height(8.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    DateRangePreset.entries.forEach { preset ->
                        FilterChip(
                            selected = state.datePreset == preset,
                            onClick = { onDatePresetSelected(preset) },
                            label = { Text(preset.displayName) },
                            modifier = Modifier.semantics {
                                contentDescription = "Date range: ${preset.displayName}"
                            },
                        )
                    }
                }
            }

            // Custom date pickers (shown when CUSTOM preset)
            if (state.datePreset == DateRangePreset.CUSTOM) {
                item(key = "dates") {
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

            // Chart type selector (#1112)
            item(key = "chart-type") {
                Text(
                    "Chart Type",
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.semantics {
                        heading()
                        contentDescription = "Chart type selection"
                    },
                )
                Spacer(Modifier.height(8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ChartType.entries.forEach { type ->
                        val icon = when (type) {
                            ChartType.BAR -> Icons.Filled.BarChart
                            ChartType.LINE -> Icons.Filled.ShowChart
                            ChartType.PIE -> Icons.Filled.PieChart
                        }
                        FilterChip(
                            selected = state.chartType == type,
                            onClick = { onChartTypeChange(type) },
                            label = {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text(type.displayName)
                                }
                            },
                            modifier = Modifier.semantics {
                                contentDescription = "Chart type: ${type.displayName}"
                            },
                        )
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

            // Category filter (#1112)
            item(key = "category-filter") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(
                            onClickLabel = "Toggle category filter",
                            onClick = onToggleCategoryFilter,
                        ),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Category, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "Categories (${state.selectedCategoryIds.size} selected)",
                        style = MaterialTheme.typography.titleSmall,
                        modifier = Modifier
                            .weight(1f)
                            .semantics {
                                contentDescription = "Category filter: ${state.selectedCategoryIds.size} selected. Tap to expand."
                            },
                    )
                    Icon(
                        if (state.showCategoryFilter) Icons.Filled.FilterList else Icons.Filled.Add,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                }
                AnimatedVisibility(
                    visible = state.showCategoryFilter,
                    enter = expandVertically(),
                    exit = shrinkVertically(),
                ) {
                    FlowRow(
                        modifier = Modifier.padding(top = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        state.categories.forEach { category ->
                            FilterChip(
                                selected = category.id in state.selectedCategoryIds,
                                onClick = { onToggleCategory(category.id) },
                                label = { Text(category.name) },
                                modifier = Modifier.semantics {
                                    contentDescription = "Category: ${category.name}"
                                },
                            )
                        }
                    }
                }
            }

            // Account filter (#1112)
            item(key = "account-filter") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(
                            onClickLabel = "Toggle account filter",
                            onClick = onToggleAccountFilter,
                        ),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.TableChart, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "Accounts (${state.selectedAccountIds.size} selected)",
                        style = MaterialTheme.typography.titleSmall,
                        modifier = Modifier
                            .weight(1f)
                            .semantics {
                                contentDescription = "Account filter: ${state.selectedAccountIds.size} selected. Tap to expand."
                            },
                    )
                    Icon(
                        if (state.showAccountFilter) Icons.Filled.FilterList else Icons.Filled.Add,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                }
                AnimatedVisibility(
                    visible = state.showAccountFilter,
                    enter = expandVertically(),
                    exit = shrinkVertically(),
                ) {
                    FlowRow(
                        modifier = Modifier.padding(top = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        state.accounts.forEach { account ->
                            FilterChip(
                                selected = account.id in state.selectedAccountIds,
                                onClick = { onToggleAccount(account.id) },
                                label = { Text(account.name) },
                                modifier = Modifier.semantics {
                                    contentDescription = "Account: ${account.name}"
                                },
                            )
                        }
                    }
                }
            }

            // Generate button
            item(key = "generate") {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    FilledTonalButton(
                        onClick = onGenerate,
                        enabled = !state.isGenerating,
                        modifier = Modifier
                            .weight(1f)
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
                    OutlinedButton(
                        onClick = onSaveReport,
                        modifier = Modifier.semantics { contentDescription = "Save report configuration" },
                    ) {
                        Icon(Icons.Filled.BookmarkAdd, contentDescription = null, modifier = Modifier.size(18.dp))
                    }
                }
            }

            // ── Report results ──────────────────────────────────────
            if (state.report != null) {
                item(key = "summary") {
                    ReportSummaryCard(
                        income = state.totalIncomeFormatted,
                        expenses = state.totalExpensesFormatted,
                        net = state.netAmountFormatted,
                        count = state.transactionCount,
                    )
                }

                // Chart visualization (#1112)
                if (state.chartData.isNotEmpty()) {
                    item(key = "chart") {
                        ReportChart(
                            chartType = state.chartType,
                            data = state.chartData,
                        )
                    }
                }

                items(state.reportGroups, key = { it.label }) { group ->
                    ReportGroupCard(group)
                }

                // Export buttons (#1112)
                item(key = "export") {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            "Export Options",
                            style = MaterialTheme.typography.titleSmall,
                            modifier = Modifier.semantics {
                                heading()
                                contentDescription = "Export options"
                            },
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            FilledTonalButton(
                                onClick = onExportPdf,
                                enabled = !state.isExporting,
                                modifier = Modifier
                                    .weight(1f)
                                    .semantics { contentDescription = "Export report as PDF" },
                            ) {
                                Icon(Icons.Filled.PictureAsPdf, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(8.dp))
                                Text("PDF")
                            }
                            FilledTonalButton(
                                onClick = onExportCsv,
                                enabled = !state.isExporting,
                                modifier = Modifier
                                    .weight(1f)
                                    .semantics { contentDescription = "Export report as CSV" },
                            ) {
                                Icon(Icons.Filled.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(8.dp))
                                Text("CSV")
                            }
                        }
                    }
                }
            }
        }

        item(key = "spacer") { Spacer(Modifier.height(80.dp)) }
    }
}

// ── Template card (#1112) ────────────────────────────────────────────

/**
 * Card displaying a report template option (#1112).
 */
@Composable
private fun TemplateCard(
    template: ReportTemplate,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    val icon = when (template) {
        ReportTemplate.MONTHLY_SUMMARY -> Icons.Filled.CalendarMonth
        ReportTemplate.CATEGORY_BREAKDOWN -> Icons.Filled.PieChart
        ReportTemplate.TREND_ANALYSIS -> Icons.Filled.ShowChart
        ReportTemplate.CUSTOM -> Icons.Filled.Description
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(
                onClickLabel = "Select ${template.displayName} template",
                onClick = onClick,
            )
            .semantics {
                contentDescription = "${template.displayName}: ${template.description}"
            },
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surfaceVariant
            },
        ),
    ) {
        Row(
            Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = if (isSelected) {
                    MaterialTheme.colorScheme.onPrimaryContainer
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
                modifier = Modifier.size(32.dp),
            )
            Spacer(Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    template.displayName,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    template.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// ── Saved report card (#1112) ────────────────────────────────────────

/**
 * Card displaying a saved report with load/delete actions (#1112).
 */
@Composable
private fun SavedReportCard(
    saved: SavedReport,
    onLoad: () -> Unit,
    onDelete: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(
                onClickLabel = "Load saved report: ${saved.name}",
                onClick = onLoad,
            )
            .semantics {
                contentDescription = "Saved report: ${saved.name}, template ${saved.template.displayName}"
            },
    ) {
        Row(
            Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Filled.Folder,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(24.dp),
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    saved.name,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    saved.template.displayName,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (saved.isScheduled) {
                Icon(
                    Icons.Filled.Schedule,
                    contentDescription = "Scheduled",
                    modifier = Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.primary,
                )
                Spacer(Modifier.width(8.dp))
            }
            IconButton(
                onClick = onDelete,
                modifier = Modifier.semantics { contentDescription = "Delete saved report: ${saved.name}" },
            ) {
                Icon(
                    Icons.Filled.Delete,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
    }
}

// ── Chart composables (#1112) ────────────────────────────────────────

/**
 * Renders a chart visualization of report data (#1112).
 *
 * Supports bar, line, and pie chart types. Uses Canvas drawing
 * for lightweight, accessible chart rendering.
 */
@Composable
private fun ReportChart(
    chartType: ChartType,
    data: List<ChartDataPoint>,
) {
    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = buildString {
                    append("${chartType.displayName} showing ${data.size} groups. ")
                    data.take(3).forEach { point ->
                        append("${point.label}: ${(point.percentage * 100).toInt()}%. ")
                    }
                }
            },
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(
                chartType.displayName,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(12.dp))

            when (chartType) {
                ChartType.BAR -> BarChart(data)
                ChartType.LINE -> LineChart(data)
                ChartType.PIE -> PieChart(data)
            }

            // Legend
            Spacer(Modifier.height(12.dp))
            data.take(8).forEach { point ->
                val color = chartColors[point.color % chartColors.size]
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(vertical = 2.dp),
                ) {
                    Canvas(modifier = Modifier.size(12.dp)) {
                        drawCircle(color = color)
                    }
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "${point.label} (${(point.percentage * 100).toInt()}%)",
                        style = MaterialTheme.typography.labelSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

/**
 * Bar chart using Canvas (#1112).
 */
@Composable
private fun BarChart(data: List<ChartDataPoint>) {
    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(160.dp)
            .semantics { contentDescription = "Bar chart" },
    ) {
        val barWidth = size.width / (data.size * 2 + 1)
        val maxPercentage = data.maxOfOrNull { it.percentage } ?: 1f

        data.forEachIndexed { index, point ->
            val color = chartColors[point.color % chartColors.size]
            val barHeight = (point.percentage / maxPercentage) * size.height * 0.9f
            val x = barWidth * (index * 2 + 1)

            drawRect(
                color = color,
                topLeft = Offset(x, size.height - barHeight),
                size = Size(barWidth, barHeight),
            )
        }
    }
}

/**
 * Line chart using Canvas (#1112).
 */
@Composable
private fun LineChart(data: List<ChartDataPoint>) {
    val primaryColor = MaterialTheme.colorScheme.primary

    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(160.dp)
            .semantics { contentDescription = "Line chart" },
    ) {
        if (data.size < 2) return@Canvas
        val maxPercentage = data.maxOfOrNull { it.percentage } ?: 1f
        val stepX = size.width / (data.size - 1).coerceAtLeast(1)

        for (i in 0 until data.size - 1) {
            val x1 = stepX * i
            val y1 = size.height - (data[i].percentage / maxPercentage) * size.height * 0.9f
            val x2 = stepX * (i + 1)
            val y2 = size.height - (data[i + 1].percentage / maxPercentage) * size.height * 0.9f

            drawLine(
                color = primaryColor,
                start = Offset(x1, y1),
                end = Offset(x2, y2),
                strokeWidth = 3f,
                cap = StrokeCap.Round,
            )
            // Data point dot
            drawCircle(
                color = primaryColor,
                radius = 6f,
                center = Offset(x1, y1),
            )
        }
        // Last dot
        val lastX = stepX * (data.size - 1)
        val lastY = size.height - (data.last().percentage / maxPercentage) * size.height * 0.9f
        drawCircle(color = primaryColor, radius = 6f, center = Offset(lastX, lastY))
    }
}

/**
 * Pie chart using Canvas (#1112).
 */
@Composable
private fun PieChart(data: List<ChartDataPoint>) {
    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(1.5f)
            .semantics { contentDescription = "Pie chart" },
    ) {
        val diameter = minOf(size.width, size.height) * 0.8f
        val topLeft = Offset((size.width - diameter) / 2, (size.height - diameter) / 2)
        val arcSize = Size(diameter, diameter)
        var startAngle = -90f

        data.forEach { point ->
            val sweepAngle = point.percentage * 360f
            val color = chartColors[point.color % chartColors.size]

            drawArc(
                color = color,
                startAngle = startAngle,
                sweepAngle = sweepAngle,
                useCenter = true,
                topLeft = topLeft,
                size = arcSize,
            )
            startAngle += sweepAngle
        }
    }
}

// ── Summary and group cards ─────────────────────────────────────────

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

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, name = "Template Picker - Light")
@Preview(showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES, name = "Template Picker - Dark")
@Composable
private fun TemplatePickerPreview() {
    FinanceTheme(dynamicColor = false) {
        ReportBuilderContent(
            state = ReportBuilderUiState(
                isLoading = false,
                showTemplatePicker = true,
            ),
            onTemplateSelected = {},
            onShowTemplatePicker = {},
            onNameChange = {},
            onDatePresetSelected = {},
            onStartDateClick = {},
            onEndDateClick = {},
            onGroupByChange = {},
            onPeriodChange = {},
            onChartTypeChange = {},
            onToggleType = {},
            onToggleCategory = {},
            onToggleCategoryFilter = {},
            onToggleAccount = {},
            onToggleAccountFilter = {},
            onToggleScheduled = {},
            onGenerate = {},
            onExportPdf = {},
            onExportCsv = {},
            onSaveReport = {},
            onLoadSavedReport = {},
            onDeleteSavedReport = {},
        )
    }
}

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, name = "Report Config - Light")
@Preview(showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES, name = "Report Config - Dark")
@Composable
private fun ReportConfigPreview() {
    FinanceTheme(dynamicColor = false) {
        ReportBuilderContent(
            state = ReportBuilderUiState(
                isLoading = false,
                showTemplatePicker = false,
                selectedTemplate = ReportTemplate.MONTHLY_SUMMARY,
                reportName = "Monthly Summary",
                datePreset = DateRangePreset.THIS_MONTH,
                startDate = kotlinx.datetime.LocalDate(2025, 1, 1),
                endDate = kotlinx.datetime.LocalDate(2025, 1, 31),
                groupBy = GroupBy.CATEGORY,
                chartType = ChartType.BAR,
                report = null,
            ),
            onTemplateSelected = {},
            onShowTemplatePicker = {},
            onNameChange = {},
            onDatePresetSelected = {},
            onStartDateClick = {},
            onEndDateClick = {},
            onGroupByChange = {},
            onPeriodChange = {},
            onChartTypeChange = {},
            onToggleType = {},
            onToggleCategory = {},
            onToggleCategoryFilter = {},
            onToggleAccount = {},
            onToggleAccountFilter = {},
            onToggleScheduled = {},
            onGenerate = {},
            onExportPdf = {},
            onExportCsv = {},
            onSaveReport = {},
            onLoadSavedReport = {},
            onDeleteSavedReport = {},
        )
    }
}

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, name = "Report Results with Chart - Light")
@Preview(showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES, name = "Report Results with Chart - Dark")
@Composable
private fun ReportResultsPreview() {
    FinanceTheme(dynamicColor = false) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ReportSummaryCard("$3,200.00", "$2,100.00", "$1,100.00", 42)
            ReportChart(
                chartType = ChartType.PIE,
                data = listOf(
                    ChartDataPoint("Groceries", 45000, 0.35f, 0),
                    ChartDataPoint("Dining", 28000, 0.22f, 1),
                    ChartDataPoint("Transport", 19000, 0.15f, 2),
                    ChartDataPoint("Entertainment", 12000, 0.09f, 3),
                    ChartDataPoint("Other", 24000, 0.19f, 4),
                ),
            )
            ReportGroupCard(ReportGroupUi("Groceries", "$450.00", 12, 0.35f))
            ReportGroupCard(ReportGroupUi("Dining", "$280.00", 8, 0.22f))
        }
    }
}
