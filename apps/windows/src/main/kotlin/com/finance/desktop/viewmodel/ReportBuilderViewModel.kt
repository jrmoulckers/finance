// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.core.aggregation.FinancialAggregator
import com.finance.core.currency.CurrencyFormatter
import com.finance.desktop.data.repository.AccountRepository
import com.finance.desktop.data.repository.BudgetRepository
import com.finance.desktop.data.repository.CategoryRepository
import com.finance.desktop.data.repository.TransactionRepository
import com.finance.models.TransactionType
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/**
 * Available report types that can be generated.
 */
enum class ReportType(val displayName: String, val description: String) {
    SPENDING_BY_CATEGORY("Spending by Category", "Breakdown of expenses grouped by category"),
    INCOME_VS_EXPENSE("Income vs Expense", "Monthly comparison of income and expenses"),
    NET_WORTH_TREND("Net Worth Trend", "Net worth changes over the selected period"),
    BUDGET_PERFORMANCE("Budget Performance", "Budget utilization and adherence analysis"),
    ACCOUNT_SUMMARY("Account Summary", "Balance and activity summary per account"),
}

/**
 * Date range presets for report generation.
 */
enum class DateRangePreset(val displayName: String) {
    THIS_MONTH("This Month"),
    LAST_MONTH("Last Month"),
    LAST_3_MONTHS("Last 3 Months"),
    LAST_6_MONTHS("Last 6 Months"),
    THIS_YEAR("This Year"),
    LAST_YEAR("Last Year"),
    CUSTOM("Custom Range"),
}

/**
 * Configuration for a custom report.
 */
data class ReportConfig(
    val reportType: ReportType = ReportType.SPENDING_BY_CATEGORY,
    val dateRangePreset: DateRangePreset = DateRangePreset.THIS_MONTH,
    val customStartDate: LocalDate? = null,
    val customEndDate: LocalDate? = null,
    val includeSubcategories: Boolean = true,
    val groupByMonth: Boolean = false,
    val selectedAccountIds: Set<String> = emptySet(),
)

/**
 * A single row in the generated report.
 */
data class ReportRow(
    val label: String,
    val value: String,
    val percentage: Float = 0f,
    val subRows: List<ReportRow> = emptyList(),
)

/**
 * Generated report output ready for display.
 */
data class GeneratedReport(
    val title: String,
    val subtitle: String,
    val generatedAt: String,
    val totalFormatted: String,
    val rows: List<ReportRow>,
    val summaryItems: List<Pair<String, String>> = emptyList(),
)

/**
 * UI state for the report builder screen.
 */
data class ReportBuilderUiState(
    val isLoading: Boolean = false,
    val config: ReportConfig = ReportConfig(),
    val report: GeneratedReport? = null,
    val availableAccounts: List<Pair<String, String>> = emptyList(),
    val errorMessage: String? = null,
)

/**
 * ViewModel for the Custom Report Builder screen.
 *
 * Allows users to configure report parameters (type, date range,
 * account filters) and generates formatted reports using KMP shared
 * logic from `packages/core`.
 */
class ReportBuilderViewModel(
    private val transactionRepository: TransactionRepository,
    private val accountRepository: AccountRepository,
    private val budgetRepository: BudgetRepository,
    private val categoryRepository: CategoryRepository,
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
            _uiState.value = _uiState.value.copy(
                availableAccounts = accounts.map { it.id.value to it.name },
            )
        }
    }

    fun updateReportType(type: ReportType) {
        _uiState.value = _uiState.value.copy(
            config = _uiState.value.config.copy(reportType = type),
            report = null,
        )
    }

    fun updateDateRange(preset: DateRangePreset) {
        _uiState.value = _uiState.value.copy(
            config = _uiState.value.config.copy(dateRangePreset = preset),
            report = null,
        )
    }

    fun updateGroupByMonth(enabled: Boolean) {
        _uiState.value = _uiState.value.copy(
            config = _uiState.value.config.copy(groupByMonth = enabled),
            report = null,
        )
    }

    fun updateIncludeSubcategories(enabled: Boolean) {
        _uiState.value = _uiState.value.copy(
            config = _uiState.value.config.copy(includeSubcategories = enabled),
            report = null,
        )
    }

    fun toggleAccountFilter(accountId: String) {
        val current = _uiState.value.config.selectedAccountIds.toMutableSet()
        if (accountId in current) current.remove(accountId) else current.add(accountId)
        _uiState.value = _uiState.value.copy(
            config = _uiState.value.config.copy(selectedAccountIds = current),
            report = null,
        )
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }

    /**
     * Generates the report based on the current configuration.
     */
    fun generateReport() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            try {
                val config = _uiState.value.config
                val currency = Currency.USD
                val now = Clock.System.now()
                val today = now.toLocalDateTime(TimeZone.currentSystemDefault()).date
                val (startDate, endDate) = resolveDateRange(config.dateRangePreset, today)

                val transactions = transactionRepository
                    .observeByDateRange(hid, startDate, endDate).first()
                    .let { txns ->
                        if (config.selectedAccountIds.isEmpty()) txns
                        else txns.filter { it.accountId.value in config.selectedAccountIds }
                    }

                val report = when (config.reportType) {
                    ReportType.SPENDING_BY_CATEGORY -> generateSpendingByCategory(
                        transactions, currency, startDate, endDate,
                    )
                    ReportType.INCOME_VS_EXPENSE -> generateIncomeVsExpense(
                        transactions, currency, startDate, endDate,
                    )
                    ReportType.NET_WORTH_TREND -> generateNetWorthTrend(
                        currency, startDate, endDate,
                    )
                    ReportType.BUDGET_PERFORMANCE -> generateBudgetPerformance(
                        transactions, currency, today,
                    )
                    ReportType.ACCOUNT_SUMMARY -> generateAccountSummary(
                        currency,
                    )
                }

                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    report = report,
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = "Failed to generate report: ${e.message}",
                )
            }
        }
    }

    private fun resolveDateRange(
        preset: DateRangePreset,
        today: LocalDate,
    ): Pair<LocalDate, LocalDate> {
        return when (preset) {
            DateRangePreset.THIS_MONTH -> LocalDate(today.year, today.month, 1) to today
            DateRangePreset.LAST_MONTH -> {
                val lastMonth = if (today.monthNumber == 1) {
                    LocalDate(today.year - 1, 12, 1)
                } else {
                    LocalDate(today.year, today.monthNumber - 1, 1)
                }
                val lastDay = LocalDate(today.year, today.month, 1)
                    .let { LocalDate.fromEpochDays(it.toEpochDays() - 1) }
                lastMonth to lastDay
            }
            DateRangePreset.LAST_3_MONTHS -> {
                LocalDate.fromEpochDays(today.toEpochDays() - 90) to today
            }
            DateRangePreset.LAST_6_MONTHS -> {
                LocalDate.fromEpochDays(today.toEpochDays() - 180) to today
            }
            DateRangePreset.THIS_YEAR -> LocalDate(today.year, 1, 1) to today
            DateRangePreset.LAST_YEAR -> {
                LocalDate(today.year - 1, 1, 1) to LocalDate(today.year - 1, 12, 31)
            }
            DateRangePreset.CUSTOM -> {
                val config = _uiState.value.config
                (config.customStartDate ?: today) to (config.customEndDate ?: today)
            }
        }
    }

    private suspend fun generateSpendingByCategory(
        transactions: List<com.finance.models.Transaction>,
        currency: Currency,
        startDate: LocalDate,
        endDate: LocalDate,
    ): GeneratedReport {
        val expenses = transactions.filter { it.type == TransactionType.EXPENSE }
        val categories = categoryRepository.observeAll(hid).first()
        val categoryMap = categories.associateBy { it.id }

        val grouped = expenses.groupBy { it.categoryId }
        val totalSpent = expenses.sumOf { it.amount.amount }

        val rows = grouped.map { (catId, txns) ->
            val categoryName = categoryMap[catId]?.name ?: "Uncategorized"
            val amount = txns.sumOf { it.amount.amount }
            val pct = if (totalSpent != 0L) (amount.toFloat() / totalSpent.toFloat()) else 0f
            ReportRow(
                label = categoryName,
                value = CurrencyFormatter.format(
                    com.finance.models.types.Cents(amount), currency,
                ),
                percentage = pct,
            )
        }.sortedByDescending { it.percentage }

        return GeneratedReport(
            title = "Spending by Category",
            subtitle = "$startDate to $endDate",
            generatedAt = Clock.System.now().toLocalDateTime(
                TimeZone.currentSystemDefault(),
            ).toString(),
            totalFormatted = CurrencyFormatter.format(
                com.finance.models.types.Cents(totalSpent), currency,
            ),
            rows = rows,
            summaryItems = listOf(
                "Total Spent" to CurrencyFormatter.format(
                    com.finance.models.types.Cents(totalSpent), currency,
                ),
                "Categories" to "${grouped.size}",
                "Transactions" to "${expenses.size}",
            ),
        )
    }

    private fun generateIncomeVsExpense(
        transactions: List<com.finance.models.Transaction>,
        currency: Currency,
        startDate: LocalDate,
        endDate: LocalDate,
    ): GeneratedReport {
        val income = transactions.filter { it.type == TransactionType.INCOME }
        val expenses = transactions.filter { it.type == TransactionType.EXPENSE }
        val totalIncome = income.sumOf { it.amount.amount }
        val totalExpense = expenses.sumOf { it.amount.amount }
        val netFlow = totalIncome - totalExpense

        val rows = listOf(
            ReportRow(
                label = "Total Income",
                value = CurrencyFormatter.format(
                    com.finance.models.types.Cents(totalIncome), currency,
                ),
                percentage = 1f,
            ),
            ReportRow(
                label = "Total Expenses",
                value = CurrencyFormatter.format(
                    com.finance.models.types.Cents(totalExpense), currency,
                ),
                percentage = if (totalIncome > 0) totalExpense.toFloat() / totalIncome.toFloat() else 0f,
            ),
            ReportRow(
                label = "Net Cash Flow",
                value = CurrencyFormatter.format(
                    com.finance.models.types.Cents(netFlow), currency,
                ),
                percentage = if (totalIncome > 0) netFlow.toFloat() / totalIncome.toFloat() else 0f,
            ),
        )

        val savingsRate = if (totalIncome > 0) {
            ((totalIncome - totalExpense) * 100 / totalIncome).toInt()
        } else {
            0
        }

        return GeneratedReport(
            title = "Income vs Expense",
            subtitle = "$startDate to $endDate",
            generatedAt = Clock.System.now().toLocalDateTime(
                TimeZone.currentSystemDefault(),
            ).toString(),
            totalFormatted = CurrencyFormatter.format(
                com.finance.models.types.Cents(netFlow), currency,
            ),
            rows = rows,
            summaryItems = listOf(
                "Savings Rate" to "$savingsRate%",
                "Income Txns" to "${income.size}",
                "Expense Txns" to "${expenses.size}",
            ),
        )
    }

    private suspend fun generateNetWorthTrend(
        currency: Currency,
        startDate: LocalDate,
        endDate: LocalDate,
    ): GeneratedReport {
        val accounts = accountRepository.observeAll(hid).first()
        val netWorth = FinancialAggregator.netWorth(accounts)

        val rows = accounts.map { account ->
            ReportRow(
                label = account.name,
                value = CurrencyFormatter.format(account.currentBalance, currency),
                percentage = if (netWorth.amount != 0L) {
                    account.currentBalance.amount.toFloat() / netWorth.amount.toFloat()
                } else {
                    0f
                },
            )
        }.sortedByDescending { it.percentage }

        return GeneratedReport(
            title = "Net Worth Trend",
            subtitle = "$startDate to $endDate",
            generatedAt = Clock.System.now().toLocalDateTime(
                TimeZone.currentSystemDefault(),
            ).toString(),
            totalFormatted = CurrencyFormatter.format(netWorth, currency),
            rows = rows,
            summaryItems = listOf(
                "Net Worth" to CurrencyFormatter.format(netWorth, currency),
                "Accounts" to "${accounts.size}",
            ),
        )
    }

    private suspend fun generateBudgetPerformance(
        transactions: List<com.finance.models.Transaction>,
        currency: Currency,
        today: LocalDate,
    ): GeneratedReport {
        val budgets = budgetRepository.observeAll(hid).first()
        val totalBudgeted = budgets.sumOf { it.amount.amount }

        val rows = budgets.map { budget ->
            val catTxns = transactions.filter { it.categoryId == budget.categoryId }
            val spent = catTxns.sumOf { it.amount.amount }
            val utilization = if (budget.amount.amount > 0) {
                spent.toFloat() / budget.amount.amount.toFloat()
            } else {
                0f
            }
            ReportRow(
                label = budget.name,
                value = "${CurrencyFormatter.format(
                    com.finance.models.types.Cents(spent), currency,
                )} / ${CurrencyFormatter.format(budget.amount, currency)}",
                percentage = utilization.coerceIn(0f, 1.5f),
            )
        }

        val overBudgetCount = rows.count { it.percentage > 1f }

        return GeneratedReport(
            title = "Budget Performance",
            subtitle = "As of $today",
            generatedAt = Clock.System.now().toLocalDateTime(
                TimeZone.currentSystemDefault(),
            ).toString(),
            totalFormatted = CurrencyFormatter.format(
                com.finance.models.types.Cents(totalBudgeted), currency,
            ),
            rows = rows,
            summaryItems = listOf(
                "Total Budgeted" to CurrencyFormatter.format(
                    com.finance.models.types.Cents(totalBudgeted), currency,
                ),
                "Budgets" to "${budgets.size}",
                "Over Budget" to "$overBudgetCount",
            ),
        )
    }

    private suspend fun generateAccountSummary(
        currency: Currency,
    ): GeneratedReport {
        val accounts = accountRepository.observeAll(hid).first()
        val totalBalance = accounts.sumOf { it.currentBalance.amount }

        val rows = accounts.map { account ->
            ReportRow(
                label = account.name,
                value = CurrencyFormatter.format(account.currentBalance, currency),
                percentage = if (totalBalance != 0L) {
                    (account.currentBalance.amount.toFloat() / totalBalance.toFloat()).coerceIn(0f, 1f)
                } else {
                    0f
                },
            )
        }.sortedByDescending { it.percentage }

        return GeneratedReport(
            title = "Account Summary",
            subtitle = "Current balances",
            generatedAt = Clock.System.now().toLocalDateTime(
                TimeZone.currentSystemDefault(),
            ).toString(),
            totalFormatted = CurrencyFormatter.format(
                com.finance.models.types.Cents(totalBalance), currency,
            ),
            rows = rows,
            summaryItems = listOf(
                "Total Balance" to CurrencyFormatter.format(
                    com.finance.models.types.Cents(totalBalance), currency,
                ),
                "Active Accounts" to "${accounts.size}",
            ),
        )
    }
}
