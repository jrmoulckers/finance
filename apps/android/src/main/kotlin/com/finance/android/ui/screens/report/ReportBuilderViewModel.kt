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
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import timber.log.Timber

/**
 * UI state for the Custom Report Builder (#1117).
 */
data class ReportBuilderUiState(
    val isLoading: Boolean = true,
    val reportName: String = "Financial Report",
    val startDate: LocalDate? = null,
    val endDate: LocalDate? = null,
    val groupBy: GroupBy = GroupBy.CATEGORY,
    val periodGrouping: PeriodGrouping = PeriodGrouping.MONTHLY,
    val selectedTransactionTypes: Set<TransactionType> = emptySet(),
    val selectedAccountIds: Set<SyncId> = emptySet(),
    val selectedCategoryIds: Set<SyncId> = emptySet(),
    val accounts: List<Account> = emptyList(),
    val categories: List<Category> = emptyList(),
    val showDatePicker: Boolean = false,
    val isPickingStartDate: Boolean = true,
    // Generated report
    val report: Report? = null,
    val reportGroups: List<ReportGroupUi> = emptyList(),
    val totalIncomeFormatted: String = "",
    val totalExpensesFormatted: String = "",
    val netAmountFormatted: String = "",
    val transactionCount: Int = 0,
    val isGenerating: Boolean = false,
    val isExporting: Boolean = false,
    val exportHtml: String? = null,
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
 * ViewModel for the Custom Report Builder (#1117).
 *
 * Configures report parameters and delegates generation to the KMP
 * [ReportBuilderEngine]. Supports PDF export via Android print framework.
 *
 * @param householdIdProvider Provides the current household scope.
 * @param transactionRepository Source for transaction data.
 * @param accountRepository Source for account list.
 * @param categoryRepository Source for category list.
 */
class ReportBuilderViewModel(
    private val householdIdProvider: HouseholdIdProvider,
    private val transactionRepository: TransactionRepository,
    private val accountRepository: AccountRepository,
    private val categoryRepository: CategoryRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReportBuilderUiState())
    val uiState: StateFlow<ReportBuilderUiState> = _uiState.asStateFlow()

    private val currency = Currency.USD

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
                )
            }
            Timber.d("Report builder loaded: %d accounts, %d categories", accounts.size, categories.size)
        }
    }

    fun updateReportName(name: String) {
        _uiState.update { it.copy(reportName = name) }
    }

    fun updateStartDate(date: LocalDate) {
        _uiState.update { it.copy(startDate = date, showDatePicker = false) }
    }

    fun updateEndDate(date: LocalDate) {
        _uiState.update { it.copy(endDate = date, showDatePicker = false) }
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

    fun generateReport() {
        viewModelScope.launch {
            _uiState.update { it.copy(isGenerating = true, errorMessage = null) }
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

    fun exportToPdf() {
        viewModelScope.launch {
            _uiState.update { it.copy(isExporting = true) }
            val report = _uiState.value.report ?: run {
                _uiState.update { it.copy(isExporting = false, errorMessage = "Generate a report first") }
                return@launch
            }

            // Build HTML for Android Print Framework
            val html = buildReportHtml(report)
            _uiState.update { it.copy(isExporting = false, exportHtml = html) }
            Timber.d("Report HTML generated for PDF export")
        }
    }

    fun clearExportHtml() {
        _uiState.update { it.copy(exportHtml = null) }
    }

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
