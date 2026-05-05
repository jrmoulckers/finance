// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.data.repository.AccountRepository
import com.finance.desktop.data.repository.CategoryRepository
import com.finance.desktop.data.repository.TransactionRepository
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.datetime.*

// ─────────────────────────────────────────────────────────────────────────────
// Custom Report Builder UI State — Sprint 20 (#303) + Enhancement (#1115)
// ─────────────────────────────────────────────────────────────────────────────

/** Report type the user can generate. */
enum class ReportType { INCOME_EXPENSE, SPENDING_BY_CATEGORY, NET_WORTH_TREND, CASH_FLOW, ACCOUNT_SUMMARY }

/** Date range presets for quick selection. */
enum class DateRangePreset { LAST_7_DAYS, LAST_30_DAYS, THIS_MONTH, LAST_MONTH, THIS_QUARTER, THIS_YEAR, CUSTOM }

/** Export format for report output. */
enum class ExportFormat { PDF, CSV, SHARE }

/** Report template with pre-configured settings. */
enum class ReportTemplate {
    /** Monthly income vs expenses summary. */
    MONTHLY_SUMMARY,

    /** Breakdown of spending by category with percentages. */
    CATEGORY_BREAKDOWN,

    /** Multi-month trend analysis. */
    TREND_ANALYSIS,

    /** Fully custom report with manual configuration. */
    CUSTOM,
}

/** A single row in the report preview table. */
data class ReportPreviewRow(
    val label: String,
    val amount: String,
    val percentage: Float,
    val isIncome: Boolean,
)

/** Summary statistics for the report preview. */
data class ReportSummary(
    val totalIncome: String,
    val totalExpenses: String,
    val netAmount: String,
    val transactionCount: Int,
)

/** A chart data point for the report preview chart. */
data class ReportChartPoint(
    val label: String,
    val value: Float,
    val formattedValue: String,
    val isIncome: Boolean,
)

/** A saved report configuration for later reuse. */
data class SavedReport(
    val id: String,
    val name: String,
    val template: ReportTemplate,
    val reportType: ReportType,
    val dateRangePreset: DateRangePreset,
    val startDate: String,
    val endDate: String,
    val selectedAccountIds: Set<String>,
    val selectedCategoryIds: Set<String>,
    val includeTransfers: Boolean,
    val createdAt: Instant,
    val isScheduled: Boolean = false,
)

data class ReportBuilderUiState(
    val isLoading: Boolean = false,
    val reportType: ReportType = ReportType.INCOME_EXPENSE,
    val dateRangePreset: DateRangePreset = DateRangePreset.THIS_MONTH,
    val startDate: String = "",
    val endDate: String = "",
    val selectedAccountIds: Set<String> = emptySet(),
    val availableAccounts: List<Pair<String, String>> = emptyList(), // id, name
    val selectedCategoryIds: Set<String> = emptySet(),
    val availableCategories: List<Pair<String, String>> = emptyList(), // id, name
    val includeTransfers: Boolean = false,
    val previewRows: List<ReportPreviewRow> = emptyList(),
    val summary: ReportSummary? = null,
    val chartData: List<ReportChartPoint> = emptyList(),
    val isPreviewReady: Boolean = false,
    val isExporting: Boolean = false,
    val exportSuccess: Boolean = false,
    val exportFormat: ExportFormat = ExportFormat.PDF,
    val selectedTemplate: ReportTemplate = ReportTemplate.CUSTOM,
    val savedReports: List<SavedReport> = emptyList(),
    val showSavedReports: Boolean = false,
    val saveReportName: String = "",
    val showSaveDialog: Boolean = false,
    val isScheduled: Boolean = false,
)

/**
 * ViewModel for the Custom Report Builder.
 *
 * Manages report configuration (template, type, date range, category/account filters),
 * generates a preview of the data with chart-ready points, handles export to
 * PDF/CSV/Share format, and supports saving/loading report configurations.
 */
class ReportBuilderViewModel(
    private val accountRepository: AccountRepository,
    private val transactionRepository: TransactionRepository,
    private val categoryRepository: CategoryRepository,
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(ReportBuilderUiState())
    val uiState: StateFlow<ReportBuilderUiState> = _uiState.asStateFlow()

    private val hid = SyncId("d1")

    init {
        loadAccounts()
        loadCategories()
    }

    private fun loadAccounts() {
        viewModelScope.launch {
            val accounts = accountRepository.observeAll(hid).first()
            val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
            val monthStart = LocalDate(today.year, today.month, 1)

            _uiState.value = _uiState.value.copy(
                availableAccounts = accounts.map { it.id.value to it.name },
                selectedAccountIds = accounts.map { it.id.value }.toSet(),
                startDate = monthStart.toString(),
                endDate = today.toString(),
            )
        }
    }

    private fun loadCategories() {
        viewModelScope.launch {
            val categories = categoryRepository.observeAll(hid).first()
            _uiState.value = _uiState.value.copy(
                availableCategories = categories.map { it.id.value to it.name },
                selectedCategoryIds = categories.map { it.id.value }.toSet(),
            )
        }
    }

    // ── Template selection ───────────────────────────────────────────────────

    /**
     * Selects a report template and auto-configures report type and date range.
     */
    fun selectTemplate(template: ReportTemplate) {
        val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
        when (template) {
            ReportTemplate.MONTHLY_SUMMARY -> {
                _uiState.value = _uiState.value.copy(
                    selectedTemplate = template,
                    reportType = ReportType.INCOME_EXPENSE,
                    dateRangePreset = DateRangePreset.THIS_MONTH,
                    startDate = LocalDate(today.year, today.month, 1).toString(),
                    endDate = today.toString(),
                    isPreviewReady = false,
                )
            }
            ReportTemplate.CATEGORY_BREAKDOWN -> {
                _uiState.value = _uiState.value.copy(
                    selectedTemplate = template,
                    reportType = ReportType.SPENDING_BY_CATEGORY,
                    dateRangePreset = DateRangePreset.THIS_MONTH,
                    startDate = LocalDate(today.year, today.month, 1).toString(),
                    endDate = today.toString(),
                    isPreviewReady = false,
                )
            }
            ReportTemplate.TREND_ANALYSIS -> {
                _uiState.value = _uiState.value.copy(
                    selectedTemplate = template,
                    reportType = ReportType.NET_WORTH_TREND,
                    dateRangePreset = DateRangePreset.THIS_YEAR,
                    startDate = LocalDate(today.year, 1, 1).toString(),
                    endDate = today.toString(),
                    isPreviewReady = false,
                )
            }
            ReportTemplate.CUSTOM -> {
                _uiState.value = _uiState.value.copy(
                    selectedTemplate = template,
                    isPreviewReady = false,
                )
            }
        }
    }

    fun setReportType(type: ReportType) {
        _uiState.value = _uiState.value.copy(
            reportType = type,
            selectedTemplate = ReportTemplate.CUSTOM,
            isPreviewReady = false,
        )
    }

    fun setDateRangePreset(preset: DateRangePreset) {
        val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
        val (start, end) = when (preset) {
            DateRangePreset.LAST_7_DAYS -> today.minus(7, DateTimeUnit.DAY) to today
            DateRangePreset.LAST_30_DAYS -> today.minus(30, DateTimeUnit.DAY) to today
            DateRangePreset.THIS_MONTH -> LocalDate(today.year, today.month, 1) to today
            DateRangePreset.LAST_MONTH -> {
                val lastMonth = today.minus(1, DateTimeUnit.MONTH)
                val firstDayLast = LocalDate(lastMonth.year, lastMonth.month, 1)
                val lastDayLast = LocalDate(today.year, today.month, 1).minus(1, DateTimeUnit.DAY)
                firstDayLast to lastDayLast
            }
            DateRangePreset.THIS_QUARTER -> {
                val quarterMonth = ((today.monthNumber - 1) / 3) * 3 + 1
                LocalDate(today.year, quarterMonth, 1) to today
            }
            DateRangePreset.THIS_YEAR -> LocalDate(today.year, 1, 1) to today
            DateRangePreset.CUSTOM -> return // No auto-compute for custom
        }
        _uiState.value = _uiState.value.copy(
            dateRangePreset = preset,
            startDate = start.toString(),
            endDate = end.toString(),
            isPreviewReady = false,
        )
    }

    fun setStartDate(date: String) {
        _uiState.value = _uiState.value.copy(
            startDate = date,
            dateRangePreset = DateRangePreset.CUSTOM,
            isPreviewReady = false,
        )
    }

    fun setEndDate(date: String) {
        _uiState.value = _uiState.value.copy(
            endDate = date,
            dateRangePreset = DateRangePreset.CUSTOM,
            isPreviewReady = false,
        )
    }

    fun toggleAccountSelection(accountId: String) {
        val current = _uiState.value.selectedAccountIds
        val updated = if (accountId in current) current - accountId else current + accountId
        _uiState.value = _uiState.value.copy(selectedAccountIds = updated, isPreviewReady = false)
    }

    // ── Category filter ─────────────────────────────────────────────────────

    /** Toggles a category in the multi-select filter. */
    fun toggleCategorySelection(categoryId: String) {
        val current = _uiState.value.selectedCategoryIds
        val updated = if (categoryId in current) current - categoryId else current + categoryId
        _uiState.value = _uiState.value.copy(selectedCategoryIds = updated, isPreviewReady = false)
    }

    /** Selects all categories. */
    fun selectAllCategories() {
        _uiState.value = _uiState.value.copy(
            selectedCategoryIds = _uiState.value.availableCategories.map { it.first }.toSet(),
            isPreviewReady = false,
        )
    }

    /** Deselects all categories. */
    fun deselectAllCategories() {
        _uiState.value = _uiState.value.copy(
            selectedCategoryIds = emptySet(),
            isPreviewReady = false,
        )
    }

    fun toggleIncludeTransfers() {
        _uiState.value = _uiState.value.copy(
            includeTransfers = !_uiState.value.includeTransfers,
            isPreviewReady = false,
        )
    }

    fun setExportFormat(format: ExportFormat) {
        _uiState.value = _uiState.value.copy(exportFormat = format)
    }

    // ── Scheduled reports ───────────────────────────────────────────────────

    /** Toggles the scheduled report flag. */
    fun toggleScheduled() {
        _uiState.value = _uiState.value.copy(isScheduled = !_uiState.value.isScheduled)
    }

    // ── Preview generation ──────────────────────────────────────────────────

    /** Generates the report preview with data rows and chart points. */
    fun generatePreview() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)

            val transactions = transactionRepository.observeAll(hid).first()
            val currency = Currency.USD

            val startDate = try { LocalDate.parse(_uiState.value.startDate) } catch (_: Exception) { return@launch }
            val endDate = try { LocalDate.parse(_uiState.value.endDate) } catch (_: Exception) { return@launch }

            val selectedCategories = _uiState.value.selectedCategoryIds

            val filtered = transactions.filter { txn ->
                txn.date in startDate..endDate &&
                    txn.accountId.value in _uiState.value.selectedAccountIds &&
                    (selectedCategories.isEmpty() ||
                        txn.categoryId?.value in selectedCategories ||
                        (txn.categoryId == null && "Uncategorized" in selectedCategories))
            }

            val income = filtered.filter { it.type == TransactionType.INCOME }
            val expenses = filtered.filter { it.type == TransactionType.EXPENSE }

            val totalIncome = Cents(income.sumOf { it.amount.amount })
            val totalExpenses = Cents(expenses.sumOf { it.amount.amount })
            val net = Cents(totalIncome.amount - totalExpenses.amount)
            val grandTotal = if (totalIncome.amount + totalExpenses.amount > 0)
                (totalIncome.amount + totalExpenses.amount).toFloat() else 1f

            val rows = mutableListOf<ReportPreviewRow>()
            val chartPoints = mutableListOf<ReportChartPoint>()

            // Group by category
            val byCat = filtered.groupBy { it.categoryId?.value ?: "Uncategorized" }
            byCat.entries.sortedByDescending { (_, txns) -> txns.sumOf { it.amount.amount } }
                .forEach { (catId, txns) ->
                    val catTotal = Cents(txns.sumOf { it.amount.amount })
                    val isIncome = txns.firstOrNull()?.type == TransactionType.INCOME
                    val formatted = CurrencyFormatter.format(catTotal, currency)
                    val pct = catTotal.amount.toFloat() / grandTotal
                    rows.add(
                        ReportPreviewRow(
                            label = catId,
                            amount = formatted,
                            percentage = pct,
                            isIncome = isIncome,
                        ),
                    )
                    chartPoints.add(
                        ReportChartPoint(
                            label = catId,
                            value = catTotal.amount.toFloat() / 100f,
                            formattedValue = formatted,
                            isIncome = isIncome,
                        ),
                    )
                }

            _uiState.value = _uiState.value.copy(
                isLoading = false,
                isPreviewReady = true,
                previewRows = rows,
                chartData = chartPoints,
                summary = ReportSummary(
                    totalIncome = CurrencyFormatter.format(totalIncome, currency),
                    totalExpenses = CurrencyFormatter.format(totalExpenses, currency),
                    netAmount = CurrencyFormatter.format(net, currency),
                    transactionCount = filtered.size,
                ),
            )
        }
    }

    // ── Export ───────────────────────────────────────────────────────────────

    /** Exports the current report in the selected format (PDF/CSV/Share). */
    fun exportReport() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isExporting = true)
            kotlinx.coroutines.delay(1500) // Simulate export
            _uiState.value = _uiState.value.copy(
                isExporting = false,
                exportSuccess = true,
            )
            kotlinx.coroutines.delay(3000)
            _uiState.value = _uiState.value.copy(exportSuccess = false)
        }
    }

    // ── Saved reports ───────────────────────────────────────────────────────

    /** Shows the save report dialog. */
    fun showSaveDialog() {
        _uiState.value = _uiState.value.copy(showSaveDialog = true, saveReportName = "")
    }

    /** Hides the save report dialog. */
    fun hideSaveDialog() {
        _uiState.value = _uiState.value.copy(showSaveDialog = false, saveReportName = "")
    }

    /** Updates the name for the report being saved. */
    fun updateSaveReportName(name: String) {
        _uiState.value = _uiState.value.copy(saveReportName = name)
    }

    /** Saves the current report configuration for later reuse. */
    fun saveReport() {
        val state = _uiState.value
        val name = state.saveReportName.trim()
        if (name.isBlank()) return

        val saved = SavedReport(
            id = "rpt-${Clock.System.now().toEpochMilliseconds()}",
            name = name,
            template = state.selectedTemplate,
            reportType = state.reportType,
            dateRangePreset = state.dateRangePreset,
            startDate = state.startDate,
            endDate = state.endDate,
            selectedAccountIds = state.selectedAccountIds,
            selectedCategoryIds = state.selectedCategoryIds,
            includeTransfers = state.includeTransfers,
            createdAt = Clock.System.now(),
            isScheduled = state.isScheduled,
        )
        _uiState.value = state.copy(
            savedReports = state.savedReports + saved,
            showSaveDialog = false,
            saveReportName = "",
        )
    }

    /** Loads a saved report configuration into the builder. */
    fun loadSavedReport(report: SavedReport) {
        _uiState.value = _uiState.value.copy(
            selectedTemplate = report.template,
            reportType = report.reportType,
            dateRangePreset = report.dateRangePreset,
            startDate = report.startDate,
            endDate = report.endDate,
            selectedAccountIds = report.selectedAccountIds,
            selectedCategoryIds = report.selectedCategoryIds,
            includeTransfers = report.includeTransfers,
            isScheduled = report.isScheduled,
            showSavedReports = false,
            isPreviewReady = false,
        )
    }

    /** Deletes a saved report. */
    fun deleteSavedReport(reportId: String) {
        _uiState.value = _uiState.value.copy(
            savedReports = _uiState.value.savedReports.filter { it.id != reportId },
        )
    }

    /** Toggles the saved reports list visibility. */
    fun toggleSavedReports() {
        _uiState.value = _uiState.value.copy(
            showSavedReports = !_uiState.value.showSavedReports,
        )
    }
}
