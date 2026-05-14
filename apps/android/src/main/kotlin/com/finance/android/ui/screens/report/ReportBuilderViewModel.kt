// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.report

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.auth.HouseholdIdProvider
import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.CategoryRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.core.currency.CurrencyFormatter
import com.finance.core.report.GroupBy
import com.finance.core.report.PeriodGrouping
import com.finance.core.report.Report
import com.finance.core.report.ReportBuilderEngine
import com.finance.core.report.ReportConfig
import com.finance.core.report.ReportGroup
import com.finance.models.Account
import com.finance.models.Category
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import timber.log.Timber

// ── Report Template (#1112) ──────────────────────────────────────────

/**
 * Predefined report templates for quick creation (#1112).
 *
 * Each template pre-fills the report configuration with sensible
 * defaults for common financial reporting needs.
 */
enum class ReportTemplate(val displayName: String, val description: String) {
    /** Monthly income and expense summary grouped by category. */
    MONTHLY_SUMMARY("Monthly Summary", "Income vs expenses for the current month"),

    /** Detailed breakdown by spending category. */
    CATEGORY_BREAKDOWN("Category Breakdown", "Spending breakdown by category"),

    /** Trend analysis over multiple periods. */
    TREND_ANALYSIS("Trend Analysis", "Income and expense trends over time"),

    /** Fully customizable report with manual configuration. */
    CUSTOM("Custom Report", "Build your own report from scratch"),
}

/**
 * Preset date ranges for quick selection (#1112).
 */
enum class DateRangePreset(val displayName: String) {
    THIS_WEEK("This Week"),
    THIS_MONTH("This Month"),
    LAST_MONTH("Last Month"),
    LAST_3_MONTHS("Last 3 Months"),
    LAST_6_MONTHS("Last 6 Months"),
    THIS_YEAR("This Year"),
    LAST_YEAR("Last Year"),
    CUSTOM("Custom"),
}

/**
 * Chart types available for report visualization (#1112).
 */
enum class ChartType(val displayName: String) {
    /** Bar chart for category comparison. */
    BAR("Bar Chart"),

    /** Line chart for trend analysis. */
    LINE("Line Chart"),

    /** Pie chart for allocation breakdown. */
    PIE("Pie Chart"),
}

/**
 * Export format options for reports (#1112).
 */
enum class ExportFormat(val displayName: String) {
    PDF("PDF Document"),
    CSV("CSV Spreadsheet"),
}

/**
 * A saved report configuration that persists locally (#1112).
 *
 * @property id Unique identifier.
 * @property name User-given name for the saved report.
 * @property template Template used to create the report.
 * @property groupBy Grouping setting.
 * @property periodGrouping Period grouping (when grouped by period).
 * @property datePreset Date range preset used.
 * @property startDate Custom start date (if custom preset).
 * @property endDate Custom end date (if custom preset).
 * @property selectedCategoryIds Filter by categories.
 * @property selectedAccountIds Filter by accounts.
 * @property selectedTransactionTypes Filter by transaction types.
 * @property isScheduled Whether periodic generation is enabled.
 * @property createdAt Timestamp when the report was saved.
 */
data class SavedReport(
    val id: String,
    val name: String,
    val template: ReportTemplate,
    val groupBy: GroupBy,
    val periodGrouping: PeriodGrouping,
    val datePreset: DateRangePreset,
    val startDate: LocalDate?,
    val endDate: LocalDate?,
    val selectedCategoryIds: Set<SyncId>,
    val selectedAccountIds: Set<SyncId>,
    val selectedTransactionTypes: Set<TransactionType>,
    val isScheduled: Boolean,
    val createdAt: Long,
)

/**
 * Data point for chart rendering (#1112).
 *
 * @property label Display label (category name, period, etc.).
 * @property value Absolute amount in cents for sizing.
 * @property percentage Proportion of total (0.0–1.0).
 * @property color Color index for the chart palette.
 */
data class ChartDataPoint(
    val label: String,
    val value: Long,
    val percentage: Float,
    val color: Int,
)

/**
 * UI state for the Custom Report Builder (#1112).
 *
 * Enhanced with template picker, date range presets, category/account
 * multi-select, chart rendering data, CSV export, saved reports list,
 * and scheduled report toggle.
 */
data class ReportBuilderUiState(
    val isLoading: Boolean = true,
    val reportName: String = "Financial Report",
    // Template picker (#1112)
    val selectedTemplate: ReportTemplate = ReportTemplate.CUSTOM,
    val showTemplatePicker: Boolean = true,
    // Date range with presets (#1112)
    val datePreset: DateRangePreset = DateRangePreset.THIS_MONTH,
    val startDate: LocalDate? = null,
    val endDate: LocalDate? = null,
    // Grouping
    val groupBy: GroupBy = GroupBy.CATEGORY,
    val periodGrouping: PeriodGrouping = PeriodGrouping.MONTHLY,
    // Filters with multi-select (#1112)
    val selectedTransactionTypes: Set<TransactionType> = emptySet(),
    val selectedAccountIds: Set<SyncId> = emptySet(),
    val selectedCategoryIds: Set<SyncId> = emptySet(),
    val accounts: List<Account> = emptyList(),
    val categories: List<Category> = emptyList(),
    val showCategoryFilter: Boolean = false,
    val showAccountFilter: Boolean = false,
    val showDatePicker: Boolean = false,
    val isPickingStartDate: Boolean = true,
    // Chart rendering (#1112)
    val chartType: ChartType = ChartType.BAR,
    val chartData: List<ChartDataPoint> = emptyList(),
    // Generated report
    val report: Report? = null,
    val reportGroups: List<ReportGroupUi> = emptyList(),
    val totalIncomeFormatted: String = "",
    val totalExpensesFormatted: String = "",
    val netAmountFormatted: String = "",
    val transactionCount: Int = 0,
    val isGenerating: Boolean = false,
    // Export options (#1112)
    val isExporting: Boolean = false,
    val exportHtml: String? = null,
    val exportCsv: String? = null,
    val selectedExportFormat: ExportFormat = ExportFormat.PDF,
    // Saved reports (#1112)
    val savedReports: List<SavedReport> = emptyList(),
    val showSavedReports: Boolean = false,
    // Scheduled reports (#1112)
    val isScheduled: Boolean = false,
    // General
    val errorMessage: String? = null,
)

/**
 * UI representation of a report group for display.
 */
data class ReportGroupUi(
    val label: String,
    val totalFormatted: String,
    val count: Int,
    val percentage: Float,
)

/**
 * ViewModel for the Custom Report Builder (#1112).
 *
 * Enhanced with template-based configuration, preset date ranges,
 * category/account multi-select filters, chart data generation,
 * CSV export, saved reports persistence, and scheduled report toggle.
 * Delegates report generation to the KMP [ReportBuilderEngine].
 *
 * @param householdIdProvider Provides the current household scope.
 * @param transactionRepository Source for transaction data.
 * @param accountRepository Source for account list.
 * @param categoryRepository Source for category list.
 */
@Suppress("TooManyFunctions") // ViewModel/screen with related operations
class ReportBuilderViewModel(
    private val householdIdProvider: HouseholdIdProvider,
    private val transactionRepository: TransactionRepository,
    private val accountRepository: AccountRepository,
    private val categoryRepository: CategoryRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReportBuilderUiState())
    val uiState: StateFlow<ReportBuilderUiState> = _uiState.asStateFlow()

    private val currency = Currency.USD
    private val savedReportsStore = mutableListOf<SavedReport>()

    init {
        loadFilterOptions()
    }

    private fun loadFilterOptions() {
        viewModelScope.launch {
            val householdId = householdIdProvider.householdId.value ?: run {
                _uiState.update { it.copy(isLoading = false) }
                return@launch
            }
            val accounts = accountRepository.observeAll(householdId).first()
            val categories = categoryRepository.observeAll(householdId).first()
            val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
            val monthStart = LocalDate(today.year, today.month, 1)

            _uiState.update {
                it.copy(
                    isLoading = false,
                    accounts = accounts,
                    categories = categories,
                    startDate = monthStart,
                    endDate = today,
                    savedReports = savedReportsStore.toList(),
                )
            }
            Timber.d("Report builder loaded: %d accounts, %d categories", accounts.size, categories.size)
        }
    }

    // ── Template picker (#1112) ─────────────────────────────────────

    /**
     * Selects a report template and pre-fills configuration (#1112).
     */
    fun selectTemplate(template: ReportTemplate) {
        val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
        val monthStart = LocalDate(today.year, today.month, 1)

        when (template) {
            ReportTemplate.MONTHLY_SUMMARY -> {
                _uiState.update {
                    it.copy(
                        selectedTemplate = template,
                        showTemplatePicker = false,
                        reportName = "Monthly Summary",
                        groupBy = GroupBy.CATEGORY,
                        datePreset = DateRangePreset.THIS_MONTH,
                        startDate = monthStart,
                        endDate = today,
                        chartType = ChartType.BAR,
                    )
                }
            }
            ReportTemplate.CATEGORY_BREAKDOWN -> {
                _uiState.update {
                    it.copy(
                        selectedTemplate = template,
                        showTemplatePicker = false,
                        reportName = "Category Breakdown",
                        groupBy = GroupBy.CATEGORY,
                        datePreset = DateRangePreset.LAST_3_MONTHS,
                        startDate = today.minus(90, DateTimeUnit.DAY),
                        endDate = today,
                        chartType = ChartType.PIE,
                    )
                }
            }
            ReportTemplate.TREND_ANALYSIS -> {
                _uiState.update {
                    it.copy(
                        selectedTemplate = template,
                        showTemplatePicker = false,
                        reportName = "Trend Analysis",
                        groupBy = GroupBy.PERIOD,
                        periodGrouping = PeriodGrouping.MONTHLY,
                        datePreset = DateRangePreset.LAST_6_MONTHS,
                        startDate = today.minus(180, DateTimeUnit.DAY),
                        endDate = today,
                        chartType = ChartType.LINE,
                    )
                }
            }
            ReportTemplate.CUSTOM -> {
                _uiState.update {
                    it.copy(
                        selectedTemplate = template,
                        showTemplatePicker = false,
                        reportName = "Custom Report",
                        datePreset = DateRangePreset.THIS_MONTH,
                        startDate = monthStart,
                        endDate = today,
                    )
                }
            }
        }
        Timber.d("Template selected: %s", template.name)
    }

    /** Shows the template picker again to change template (#1112). */
    fun showTemplatePicker() {
        _uiState.update { it.copy(showTemplatePicker = true) }
    }

    // ── Date range presets (#1112) ──────────────────────────────────

    /**
     * Applies a preset date range (#1112).
     */
    fun selectDatePreset(preset: DateRangePreset) {
        val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date

        val (start, end) = when (preset) {
            DateRangePreset.THIS_WEEK -> {
                val startOfWeek = today.minus(today.dayOfWeek.ordinal, DateTimeUnit.DAY)
                startOfWeek to today
            }
            DateRangePreset.THIS_MONTH -> {
                LocalDate(today.year, today.month, 1) to today
            }
            DateRangePreset.LAST_MONTH -> {
                val lastMonth = today.minus(1, DateTimeUnit.MONTH)
                val start = LocalDate(lastMonth.year, lastMonth.month, 1)
                val endOfLastMonth = LocalDate(today.year, today.month, 1).minus(1, DateTimeUnit.DAY)
                start to endOfLastMonth
            }
            DateRangePreset.LAST_3_MONTHS -> {
                today.minus(90, DateTimeUnit.DAY) to today
            }
            DateRangePreset.LAST_6_MONTHS -> {
                today.minus(180, DateTimeUnit.DAY) to today
            }
            DateRangePreset.THIS_YEAR -> {
                LocalDate(today.year, 1, 1) to today
            }
            DateRangePreset.LAST_YEAR -> {
                LocalDate(today.year - 1, 1, 1) to LocalDate(today.year - 1, 12, 31)
            }
            DateRangePreset.CUSTOM -> {
                _uiState.update { it.copy(datePreset = preset) }
                return
            }
        }

        _uiState.update {
            it.copy(datePreset = preset, startDate = start, endDate = end)
        }
    }

    // ── Basic field updates ─────────────────────────────────────────

    fun updateReportName(name: String) {
        _uiState.update { it.copy(reportName = name) }
    }

    fun updateStartDate(date: LocalDate) {
        _uiState.update { it.copy(startDate = date, showDatePicker = false, datePreset = DateRangePreset.CUSTOM) }
    }

    fun updateEndDate(date: LocalDate) {
        _uiState.update { it.copy(endDate = date, showDatePicker = false, datePreset = DateRangePreset.CUSTOM) }
    }

    fun showDatePicker(isStart: Boolean) {
        _uiState.update { it.copy(showDatePicker = true, isPickingStartDate = isStart) }
    }

    fun dismissDatePicker() {
        _uiState.update { it.copy(showDatePicker = false) }
    }

    fun updateGroupBy(groupBy: GroupBy) {
        _uiState.update { it.copy(groupBy = groupBy) }
    }

    fun updatePeriodGrouping(period: PeriodGrouping) {
        _uiState.update { it.copy(periodGrouping = period) }
    }

    // ── Chart type (#1112) ──────────────────────────────────────────

    /** Changes the chart visualization type (#1112). */
    fun updateChartType(chartType: ChartType) {
        _uiState.update { it.copy(chartType = chartType) }
    }

    // ── Multi-select filters (#1112) ────────────────────────────────

    fun toggleTransactionType(type: TransactionType) {
        _uiState.update { state ->
            val current = state.selectedTransactionTypes
            val updated = if (type in current) current - type else current + type
            state.copy(selectedTransactionTypes = updated)
        }
    }

    fun toggleAccount(accountId: SyncId) {
        _uiState.update { state ->
            val current = state.selectedAccountIds
            val updated = if (accountId in current) current - accountId else current + accountId
            state.copy(selectedAccountIds = updated)
        }
    }

    fun toggleCategory(categoryId: SyncId) {
        _uiState.update { state ->
            val current = state.selectedCategoryIds
            val updated = if (categoryId in current) current - categoryId else current + categoryId
            state.copy(selectedCategoryIds = updated)
        }
    }

    /** Toggles the category filter panel visibility (#1112). */
    fun toggleCategoryFilter() {
        _uiState.update { it.copy(showCategoryFilter = !it.showCategoryFilter) }
    }

    /** Toggles the account filter panel visibility (#1112). */
    fun toggleAccountFilter() {
        _uiState.update { it.copy(showAccountFilter = !it.showAccountFilter) }
    }

    // ── Scheduled reports toggle (#1112) ────────────────────────────

    /** Toggles scheduled report generation on/off (#1112). */
    fun toggleScheduled() {
        _uiState.update { it.copy(isScheduled = !it.isScheduled) }
    }

    // ── Report generation ───────────────────────────────────────────

    fun generateReport() {
        viewModelScope.launch {
            _uiState.update { it.copy(isGenerating = true, errorMessage = null) }
            @Suppress("TooGenericExceptionCaught") // Multiple exception types possible
            try {
                val householdId = householdIdProvider.householdId.value
                    ?: error("No household ID")
                val state = _uiState.value
                val transactions = transactionRepository.observeAll(householdId).first()

                val config = ReportConfig(
                    name = state.reportName,
                    groupBy = state.groupBy,
                    periodGrouping = if (state.groupBy == GroupBy.PERIOD) state.periodGrouping else null,
                    startDate = state.startDate,
                    endDate = state.endDate,
                    transactionTypes = state.selectedTransactionTypes,
                    accountIds = state.selectedAccountIds,
                    categoryIds = state.selectedCategoryIds,
                    currency = currency,
                )

                val report = ReportBuilderEngine.generate(config, transactions)
                val totalAbs = report.groups.sumOf { kotlin.math.abs(it.totalAmount.amount) }.coerceAtLeast(1L)

                // Build chart data from report groups (#1112)
                val chartData = report.groups.mapIndexed { index, group ->
                    ChartDataPoint(
                        label = group.label,
                        value = kotlin.math.abs(group.totalAmount.amount),
                        percentage = (kotlin.math.abs(group.totalAmount.amount).toFloat() / totalAbs),
                        color = index,
                    )
                }

                _uiState.update {
                    it.copy(
                        isGenerating = false,
                        report = report,
                        reportGroups = report.groups.map { group ->
                            ReportGroupUi(
                                label = group.label,
                                totalFormatted = CurrencyFormatter.format(group.totalAmount, currency),
                                count = group.transactionCount,
                                percentage = (kotlin.math.abs(group.totalAmount.amount).toFloat() / totalAbs),
                            )
                        },
                        chartData = chartData,
                        totalIncomeFormatted = CurrencyFormatter.format(report.summary.totalIncome, currency),
                        totalExpensesFormatted = CurrencyFormatter.format(report.summary.totalExpenses, currency),
                        netAmountFormatted = CurrencyFormatter.format(report.summary.netAmount, currency),
                        transactionCount = report.summary.transactionCount,
                    )
                }
                Timber.d("Report generated: %d groups, %d transactions", report.groups.size, report.summary.transactionCount)
            } catch (e: Exception) {
                Timber.e(e, "Report generation failed")
                _uiState.update {
                    it.copy(isGenerating = false, errorMessage = "Failed to generate report")
                }
            }
        }
    }

    // ── Export options (#1112) ───────────────────────────────────────

    /** Sets the export format (#1112). */
    fun selectExportFormat(format: ExportFormat) {
        _uiState.update { it.copy(selectedExportFormat = format) }
    }

    /** Exports report in the selected format (#1112). */
    fun exportReport() {
        when (_uiState.value.selectedExportFormat) {
            ExportFormat.PDF -> exportToPdf()
            ExportFormat.CSV -> exportToCsv()
        }
    }

    fun exportToPdf() {
        viewModelScope.launch {
            _uiState.update { it.copy(isExporting = true) }
            val report = _uiState.value.report ?: run {
                _uiState.update { it.copy(isExporting = false, errorMessage = "Generate a report first") }
                return@launch
            }

            val html = buildReportHtml(report)
            _uiState.update { it.copy(isExporting = false, exportHtml = html) }
            Timber.d("Report HTML generated for PDF export")
        }
    }

    /**
     * Exports the generated report as CSV (#1112).
     *
     * Uses the KMP [ReportBuilderEngine.formatAsCsvRows] to produce
     * standard CSV content for sharing or download.
     */
    fun exportToCsv() {
        viewModelScope.launch {
            _uiState.update { it.copy(isExporting = true) }
            val report = _uiState.value.report ?: run {
                _uiState.update { it.copy(isExporting = false, errorMessage = "Generate a report first") }
                return@launch
            }

            val csvRows = ReportBuilderEngine.formatAsCsvRows(report)
            val csvContent = csvRows.joinToString("\n") { row ->
                row.joinToString(",") { field ->
                    // Escape fields containing commas or quotes
                    if (field.contains(",") || field.contains("\"")) {
                        "\"${field.replace("\"", "\"\"")}\""
                    } else {
                        field
                    }
                }
            }

            _uiState.update { it.copy(isExporting = false, exportCsv = csvContent) }
            Timber.d("Report CSV generated: %d rows", csvRows.size)
        }
    }

    fun clearExportHtml() {
        _uiState.update { it.copy(exportHtml = null) }
    }

    /** Clears the CSV export data after it has been handled (#1112). */
    fun clearExportCsv() {
        _uiState.update { it.copy(exportCsv = null) }
    }

    // ── Saved reports (#1112) ───────────────────────────────────────

    /**
     * Saves the current report configuration for later re-use (#1112).
     */
    fun saveCurrentReport() {
        val state = _uiState.value
        val savedReport = SavedReport(
            id = "report-${Clock.System.now().toEpochMilliseconds()}",
            name = state.reportName,
            template = state.selectedTemplate,
            groupBy = state.groupBy,
            periodGrouping = state.periodGrouping,
            datePreset = state.datePreset,
            startDate = state.startDate,
            endDate = state.endDate,
            selectedCategoryIds = state.selectedCategoryIds,
            selectedAccountIds = state.selectedAccountIds,
            selectedTransactionTypes = state.selectedTransactionTypes,
            isScheduled = state.isScheduled,
            createdAt = Clock.System.now().toEpochMilliseconds(),
        )
        savedReportsStore.add(0, savedReport)
        _uiState.update { it.copy(savedReports = savedReportsStore.toList()) }
        Timber.d("Report saved: %s", savedReport.name)
    }

    /**
     * Loads a saved report configuration (#1112).
     */
    fun loadSavedReport(saved: SavedReport) {
        _uiState.update {
            it.copy(
                showTemplatePicker = false,
                showSavedReports = false,
                reportName = saved.name,
                selectedTemplate = saved.template,
                groupBy = saved.groupBy,
                periodGrouping = saved.periodGrouping,
                datePreset = saved.datePreset,
                startDate = saved.startDate,
                endDate = saved.endDate,
                selectedCategoryIds = saved.selectedCategoryIds,
                selectedAccountIds = saved.selectedAccountIds,
                selectedTransactionTypes = saved.selectedTransactionTypes,
                isScheduled = saved.isScheduled,
                report = null,
                reportGroups = emptyList(),
                chartData = emptyList(),
            )
        }
        Timber.d("Saved report loaded: %s", saved.name)
    }

    /**
     * Deletes a saved report (#1112).
     */
    fun deleteSavedReport(id: String) {
        savedReportsStore.removeAll { it.id == id }
        _uiState.update { it.copy(savedReports = savedReportsStore.toList()) }
        Timber.d("Report deleted: %s", id)
    }

    /** Toggles the saved reports list visibility (#1112). */
    fun toggleSavedReports() {
        _uiState.update { it.copy(showSavedReports = !it.showSavedReports) }
    }

    // ── HTML builder ────────────────────────────────────────────────

    private fun buildReportHtml(report: Report): String {
        val rows = report.groups.joinToString("\n") { group ->
            """<tr>
                <td>${group.label}</td>
                <td>${group.transactionCount}</td>
                <td>${CurrencyFormatter.format(group.totalAmount, currency)}</td>
            </tr>"""
        }

        return """
        <!DOCTYPE html>
        <html><head><style>
            body { font-family: sans-serif; padding: 20px; }
            h1 { color: #1565C0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f5f5f5; }
            .summary { margin-top: 20px; }
            .summary span { font-weight: bold; }
        </style></head><body>
            <h1>${report.config.name}</h1>
            <div class="summary">
                <p>Income: <span>${CurrencyFormatter.format(report.summary.totalIncome, currency)}</span></p>
                <p>Expenses: <span>${CurrencyFormatter.format(report.summary.totalExpenses, currency)}</span></p>
                <p>Net: <span>${CurrencyFormatter.format(report.summary.netAmount, currency)}</span></p>
                <p>Transactions: <span>${report.summary.transactionCount}</span></p>
            </div>
            <table>
                <tr><th>Group</th><th>Transactions</th><th>Total</th></tr>
                $rows
            </table>
        </body></html>
        """.trimIndent()
    }
}
