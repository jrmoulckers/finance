// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.core.analytics.MonthlyComparison
import com.finance.core.analytics.ReportGenerator
import com.finance.core.analytics.SpendingInsight
import com.finance.core.analytics.Trend
import com.finance.core.currency.CurrencyFormatter
import com.finance.desktop.data.repository.AccountRepository
import com.finance.desktop.data.repository.CategoryRepository
import com.finance.desktop.data.repository.TransactionRepository
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

// ── UI models ────────────────────────────────────────────────────────

data class CategorySpendingUi(
    val categoryName: String,
    val amountFormatted: String,
    val amountCents: Long,
    val percentage: Float,
    val colorIndex: Int,
)

data class MonthlyComparisonUi(
    val label: String,
    val incomeFormatted: String,
    val expenseFormatted: String,
    val netFormatted: String,
    val incomeAmount: Long,
    val expenseAmount: Long,
    val netAmount: Long,
)

data class SpendingInsightUi(
    val categoryName: String,
    val currentFormatted: String,
    val previousFormatted: String,
    val percentChange: String,
    val trend: Trend,
)

data class NetWorthPointUi(
    val label: String,
    val amount: Long,
    val formatted: String,
)

data class InsightsUiState(
    val isLoading: Boolean = true,
    val categorySpending: List<CategorySpendingUi> = emptyList(),
    val monthlyComparisons: List<MonthlyComparisonUi> = emptyList(),
    val spendingInsights: List<SpendingInsightUi> = emptyList(),
    val netWorthHistory: List<NetWorthPointUi> = emptyList(),
    val totalSpendingFormatted: String = "",
    val selectedTab: InsightsTab = InsightsTab.OVERVIEW,
)

enum class InsightsTab { OVERVIEW, CATEGORIES, TRENDS }

/**
 * ViewModel for the Financial Insights Dashboard.
 *
 * Delegates heavy analytics to the KMP shared [ReportGenerator] from
 * `packages/core/analytics/`, then maps results to UI-friendly models
 * for Compose Desktop collection.
 */
class InsightsViewModel(
    private val accountRepository: AccountRepository,
    private val transactionRepository: TransactionRepository,
    private val categoryRepository: CategoryRepository,
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(InsightsUiState())
    val uiState: StateFlow<InsightsUiState> = _uiState.asStateFlow()

    private val householdId = SyncId("d1")
    private val currency = Currency.USD

    init {
        loadInsights()
    }

    fun selectTab(tab: InsightsTab) {
        _uiState.value = _uiState.value.copy(selectedTab = tab)
    }

    fun refresh() {
        loadInsights()
    }

    private fun loadInsights() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)

            val accounts = accountRepository.observeAll(householdId).first()
            val transactions = transactionRepository.observeAll(householdId).first()
            val categories = categoryRepository.observeAll(householdId).first()
            val today = Clock.System.now()
                .toLocalDateTime(TimeZone.currentSystemDefault()).date

            val categoryMap = categories.associateBy { it.id }

            // ── Category spending breakdown (current month) ──
            val monthStart = kotlinx.datetime.LocalDate(today.year, today.month, 1)
            val dateRange = ReportGenerator.DateRange(monthStart, today)
            val categorySpending = ReportGenerator.spendingByCategory(transactions, dateRange)
            val totalSpending = categorySpending.values.sumOf { it.amount }
            val categorySpendingUi = categorySpending.entries
                .sortedByDescending { it.value.amount }
                .mapIndexed { index, (catId, cents) ->
                    val pct = if (totalSpending > 0) {
                        (cents.amount.toFloat() / totalSpending * 100)
                    } else 0f
                    CategorySpendingUi(
                        categoryName = categoryMap[catId]?.name ?: "Unknown",
                        amountFormatted = CurrencyFormatter.format(cents, currency),
                        amountCents = cents.amount,
                        percentage = pct,
                        colorIndex = index % 8,
                    )
                }

            // ── Income vs. Expense (last 6 months) ──
            val monthlyComparisons = ReportGenerator.incomeVsExpense(transactions, 6, today)
            val monthlyUi = monthlyComparisons.map { mc ->
                val monthLabel = "${mc.month.name.take(3)} ${mc.year}"
                MonthlyComparisonUi(
                    label = monthLabel,
                    incomeFormatted = CurrencyFormatter.format(mc.income, currency),
                    expenseFormatted = CurrencyFormatter.format(mc.expense, currency),
                    netFormatted = CurrencyFormatter.format(mc.net, currency),
                    incomeAmount = mc.income.amount,
                    expenseAmount = mc.expense.amount,
                    netAmount = mc.net.amount,
                )
            }

            // ── Spending insights (month-over-month per category) ──
            val insights = ReportGenerator.spendingInsights(transactions, today)
            val insightsUi = insights.take(10).map { insight ->
                SpendingInsightUi(
                    categoryName = categoryMap[insight.categoryId]?.name ?: "Unknown",
                    currentFormatted = CurrencyFormatter.format(insight.currentMonth, currency),
                    previousFormatted = CurrencyFormatter.format(insight.previousMonth, currency),
                    percentChange = insight.percentChange?.let {
                        val sign = if (it >= 0) "+" else ""
                        "$sign${it.toInt()}%"
                    } ?: "New",
                    trend = insight.trend,
                )
            }

            // ── Net worth history (last 6 months) ──
            val nwHistory = ReportGenerator.netWorthOverTime(
                accounts, transactions, 6, today,
            )
            val nwUi = nwHistory.map { snapshot ->
                val label = "${snapshot.date.month.name.take(3)} ${snapshot.date.year}"
                NetWorthPointUi(
                    label = label,
                    amount = snapshot.netWorth.amount,
                    formatted = CurrencyFormatter.format(snapshot.netWorth, currency),
                )
            }

            _uiState.value = InsightsUiState(
                isLoading = false,
                categorySpending = categorySpendingUi,
                monthlyComparisons = monthlyUi,
                spendingInsights = insightsUi,
                netWorthHistory = nwUi,
                totalSpendingFormatted = CurrencyFormatter.format(Cents(totalSpending), currency),
                selectedTab = _uiState.value.selectedTab,
            )
        }
    }
}
