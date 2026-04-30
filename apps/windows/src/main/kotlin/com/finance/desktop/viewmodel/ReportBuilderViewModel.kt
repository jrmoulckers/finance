// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.data.repository.AccountRepository
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
// Custom Report Builder UI State — Sprint 20 (#303)
// ─────────────────────────────────────────────────────────────────────────────

/** Report type the user can generate. */
enum class ReportType { INCOME_EXPENSE, SPENDING_BY_CATEGORY, NET_WORTH_TREND, CASH_FLOW, ACCOUNT_SUMMARY }

/** Date range presets for quick selection. */
enum class DateRangePreset { LAST_7_DAYS, LAST_30_DAYS, THIS_MONTH, LAST_MONTH, THIS_QUARTER, THIS_YEAR, CUSTOM }

/** Export format for report output. */
enum class ExportFormat { PDF, CSV }

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

data class ReportBuilderUiState(
    val isLoading: Boolean = false,
    val reportType: ReportType = ReportType.INCOME_EXPENSE,
    val dateRangePreset: DateRangePreset = DateRangePreset.THIS_MONTH,
    val startDate: String = "",
    val endDate: String = "",
    val selectedAccountIds: Set<String> = emptySet(),
    val availableAccounts: List<Pair<String, String>> = emptyList(), // id, name
    val includeTransfers: Boolean = false,
    val previewRows: List<ReportPreviewRow> = emptyList(),
    val summary: ReportSummary? = null,
    val isPreviewReady: Boolean = false,
    val isExporting: Boolean = false,
    val exportSuccess: Boolean = false,
    val exportFormat: ExportFormat = ExportFormat.PDF,
)

/**
 * ViewModel for the Custom Report Builder.
 *
 * Manages report configuration (type, date range, filters), generates a
 * preview of the data, and handles export to PDF/CSV format.
 */
class ReportBuilderViewModel(
    private val accountRepository: AccountRepository,
    private val transactionRepository: TransactionRepository,
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(ReportBuilderUiState())
    val uiState: StateFlow<ReportBuilderUiState> = _uiState.asStateFlow()

    private val hid = SyncId("d1")

    init {
        loadAccounts()
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

    fun setReportType(type: ReportType) {
        _uiState.value = _uiState.value.copy(reportType = type, isPreviewReady = false)
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

    fun toggleIncludeTransfers() {
        _uiState.value = _uiState.value.copy(
            includeTransfers = !_uiState.value.includeTransfers,
            isPreviewReady = false,
        )
    }

    fun setExportFormat(format: ExportFormat) {
        _uiState.value = _uiState.value.copy(exportFormat = format)
    }

    fun generatePreview() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)

            val transactions = transactionRepository.observeAll(hid).first()
            val currency = Currency.USD

            val startDate = try { LocalDate.parse(_uiState.value.startDate) } catch (_: Exception) { return@launch }
            val endDate = try { LocalDate.parse(_uiState.value.endDate) } catch (_: Exception) { return@launch }

            val filtered = transactions.filter { txn ->
                txn.date in startDate..endDate &&
                    txn.accountId.value in _uiState.value.selectedAccountIds
            }

            val income = filtered.filter { it.type == TransactionType.INCOME }
            val expenses = filtered.filter { it.type == TransactionType.EXPENSE }

            val totalIncome = Cents(income.sumOf { it.amount.amount })
            val totalExpenses = Cents(expenses.sumOf { it.amount.amount })
            val net = Cents(totalIncome.amount - totalExpenses.amount)
            val grandTotal = if (totalIncome.amount + totalExpenses.amount > 0)
                (totalIncome.amount + totalExpenses.amount).toFloat() else 1f

            val rows = mutableListOf<ReportPreviewRow>()

            // Group by category
            val byCat = filtered.groupBy { it.categoryId?.value ?: "Uncategorized" }
            byCat.entries.sortedByDescending { (_, txns) -> txns.sumOf { it.amount.amount } }
                .forEach { (catId, txns) ->
                    val catTotal = Cents(txns.sumOf { it.amount.amount })
                    val isIncome = txns.firstOrNull()?.type == TransactionType.INCOME
                    rows.add(
                        ReportPreviewRow(
                            label = catId,
                            amount = CurrencyFormatter.format(catTotal, currency),
                            percentage = catTotal.amount.toFloat() / grandTotal,
                            isIncome = isIncome,
                        ),
                    )
                }

            _uiState.value = _uiState.value.copy(
                isLoading = false,
                isPreviewReady = true,
                previewRows = rows,
                summary = ReportSummary(
                    totalIncome = CurrencyFormatter.format(totalIncome, currency),
                    totalExpenses = CurrencyFormatter.format(totalExpenses, currency),
                    netAmount = CurrencyFormatter.format(net, currency),
                    transactionCount = filtered.size,
                ),
            )
        }
    }

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
}
