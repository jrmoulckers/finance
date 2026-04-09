// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.auth.HouseholdIdProvider
import com.finance.android.data.repository.CategoryRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.core.aggregation.FinancialAggregator
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.TransactionStatus
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
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
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import timber.log.Timber

/**
 * Time period options for the analytics filter chips.
 *
 * @property label Human-readable label shown in the period selector UI.
 * @property months Number of months this period spans (0 for sub-month periods).
 */
enum class AnalyticsPeriod(val label: String, val months: Int) {
    WEEK("7 Days", 0),
    MONTH("30 Days", 1),
    QUARTER("3 Months", 3),
    YEAR("12 Months", 12),
}

/**
 * Category spending breakdown with computed percentage and chart color index.
 *
 * @property name Display name of the spending category.
 * @property amount Total spent in this category as [Cents].
 * @property percentage Percentage of total spending this category represents (0–100).
 * @property colorIndex Index into the chart color palette for consistent coloring.
 */
data class CategorySpending(
    val name: String,
    val amount: Cents,
    val percentage: Float,
    val colorIndex: Int,
)

/**
 * A single data point in the monthly income-vs-expense trend chart.
 *
 * @property label Short month label (e.g. "Jan", "Feb").
 * @property income Total income for this month.
 * @property expense Total expense for this month.
 */
data class MonthlyTrendPoint(
    val label: String,
    val income: Cents,
    val expense: Cents,
)

/**
 * Side-by-side comparison of total income vs total expenses for the selected period.
 *
 * @property income Total income in the period.
 * @property expense Total expenses in the period.
 * @property net Net amount (income − expense); positive indicates savings.
 */
data class IncomeExpenseComparison(
    val income: Cents,
    val expense: Cents,
    val net: Cents,
)

/**
 * A single payee's spending summary for the top-payees list.
 *
 * @property payee Display name of the payee/merchant.
 * @property amount Total amount spent at this payee.
 * @property transactionCount Number of transactions with this payee.
 */
data class PayeeSpending(
    val payee: String,
    val amount: Cents,
    val transactionCount: Int,
)

/**
 * Complete UI state for the Analytics screen.
 *
 * Holds all computed aggregations for chart rendering and summary display.
 * Produced by [AnalyticsViewModel] and consumed by the Analytics composable.
 */
data class AnalyticsUiState(
    val isLoading: Boolean = true,
    val selectedPeriod: AnalyticsPeriod = AnalyticsPeriod.MONTH,
    val spendingByCategory: List<CategorySpending> = emptyList(),
    val monthlyTrend: List<MonthlyTrendPoint> = emptyList(),
    val incomeVsExpense: IncomeExpenseComparison? = null,
    val topPayees: List<PayeeSpending> = emptyList(),
    val totalSpent: String = "$0.00",
    val totalIncome: String = "$0.00",
    val savingsRate: String = "0%",
    val currency: Currency = Currency.USD,
)

/**
 * ViewModel for the Analytics / Spending Trends screen.
 *
 * Loads transactions and categories from their respective repositories,
 * then computes spending breakdowns, monthly trends, income-vs-expense
 * comparisons, top payees, and savings rates using shared KMP aggregation
 * logic from [FinancialAggregator].
 *
 * @param householdIdProvider Provides the authenticated user's household ID.
 * @param transactionRepository Source for transaction data.
 * @param categoryRepository Source for category metadata (names, icons).
 */
class AnalyticsViewModel(
    private val householdIdProvider: HouseholdIdProvider,
    private val transactionRepository: TransactionRepository,
    private val categoryRepository: CategoryRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AnalyticsUiState())

    /** Observable analytics UI state for the composable layer. */
    val uiState: StateFlow<AnalyticsUiState> = _uiState.asStateFlow()

    init {
        loadAnalytics()
    }

    /**
     * Updates the selected analytics period and recomputes all aggregations.
     *
     * @param period The new [AnalyticsPeriod] to display.
     */
    fun selectPeriod(period: AnalyticsPeriod) {
        _uiState.update { it.copy(selectedPeriod = period) }
        loadAnalytics()
    }

    /**
     * Loads all analytics data for the currently selected period.
     *
     * Computes: spending by category, monthly trend, income vs expense,
     * top payees, totals, and savings rate.
     */
    private fun loadAnalytics() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            val period = _uiState.value.selectedPeriod
            val currency = Currency.USD
            val householdId = householdIdProvider.householdId.value ?: run {
                Timber.w("No household ID available — skipping analytics load")
                _uiState.update { it.copy(isLoading = false) }
                return@launch
            }
            val allTransactions =
                transactionRepository.observeAll(householdId).first()
            val categories =
                categoryRepository.observeAll(householdId).first()
            val categoryMap = categories.associateBy { it.id }

            val today = Clock.System.now()
                .toLocalDateTime(TimeZone.currentSystemDefault()).date
            val startDate = computeStartDate(period, today)

            // ── Totals using shared KMP aggregator ──────────────────
            val totalExpense =
                FinancialAggregator.totalSpending(allTransactions, startDate, today)
            val totalIncomeAmount =
                FinancialAggregator.totalIncome(allTransactions, startDate, today)
            val savingsRateValue =
                FinancialAggregator.savingsRate(allTransactions, startDate, today)

            // ── Spending by category ────────────────────────────────
            val categorySpendingMap =
                FinancialAggregator.spendingByCategory(allTransactions, startDate, today)
            val safeTotalExpense =
                if (totalExpense.isZero()) 1L else totalExpense.amount
            val spendingByCategory = categorySpendingMap
                .entries
                .sortedByDescending { it.value.amount }
                .mapIndexed { index, (catId, amount) ->
                    val name = catId?.let { categoryMap[it]?.name } ?: "Uncategorized"
                    CategorySpending(
                        name = name,
                        amount = amount,
                        percentage = (amount.amount.toFloat() / safeTotalExpense) * 100f,
                        colorIndex = index,
                    )
                }

            // ── Monthly trend (income vs expense per month) ─────────
            val trendMonths = trendMonthCount(period)
            val monthlyTrend = computeMonthlyTrend(
                allTransactions, today, trendMonths,
            )

            // ── Income vs expense comparison ────────────────────────
            val net = totalIncomeAmount - totalExpense
            val incomeVsExpense = IncomeExpenseComparison(
                income = totalIncomeAmount,
                expense = totalExpense,
                net = net,
            )

            // ── Top 5 payees by spending ────────────────────────────
            val topPayees = computeTopPayees(allTransactions, startDate, today)

            // ── Format display strings ──────────────────────────────
            val savingsRateFormatted = "${savingsRateValue.toInt()}%"

            _uiState.update {
                it.copy(
                    isLoading = false,
                    spendingByCategory = spendingByCategory,
                    monthlyTrend = monthlyTrend,
                    incomeVsExpense = incomeVsExpense,
                    topPayees = topPayees,
                    totalSpent = CurrencyFormatter.format(totalExpense, currency),
                    totalIncome = CurrencyFormatter.format(totalIncomeAmount, currency),
                    savingsRate = savingsRateFormatted,
                    currency = currency,
                )
            }

            Timber.d(
                "Analytics loaded: period=%s, categories=%d, months=%d, payees=%d",
                period.label,
                spendingByCategory.size,
                monthlyTrend.size,
                topPayees.size,
            )
        }
    }

    /** Computes the start date for the given analytics period relative to [today]. */
    private fun computeStartDate(period: AnalyticsPeriod, today: LocalDate): LocalDate =
        when (period) {
            AnalyticsPeriod.WEEK -> today.minus(7, DateTimeUnit.DAY)
            AnalyticsPeriod.MONTH -> today.minus(30, DateTimeUnit.DAY)
            AnalyticsPeriod.QUARTER -> today.minus(3, DateTimeUnit.MONTH)
            AnalyticsPeriod.YEAR -> today.minus(12, DateTimeUnit.MONTH)
        }

    /** Returns the number of months to show in the trend chart for each period. */
    private fun trendMonthCount(period: AnalyticsPeriod): Int = when (period) {
        AnalyticsPeriod.WEEK -> 3
        AnalyticsPeriod.MONTH -> 6
        AnalyticsPeriod.QUARTER -> 3
        AnalyticsPeriod.YEAR -> 12
    }

    /** Builds monthly income/expense trend data for the last [months] months. */
    private fun computeMonthlyTrend(
        transactions: List<com.finance.models.Transaction>,
        today: LocalDate,
        months: Int,
    ): List<MonthlyTrendPoint> {
        val monthNames = listOf(
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        )
        return (0 until months).map { offset ->
            val monthDate = today.minus(offset, DateTimeUnit.MONTH)
            val start = LocalDate(monthDate.year, monthDate.month, 1)
            val end = start.plus(1, DateTimeUnit.MONTH).minus(1, DateTimeUnit.DAY)
            val income = FinancialAggregator.totalIncome(transactions, start, end)
            val expense = FinancialAggregator.totalSpending(transactions, start, end)
            MonthlyTrendPoint(
                label = monthNames[start.monthNumber - 1],
                income = income,
                expense = expense,
            )
        }.reversed()
    }

    /** Finds the top 5 payees by total spending within the date range. */
    private fun computeTopPayees(
        transactions: List<com.finance.models.Transaction>,
        startDate: LocalDate,
        endDate: LocalDate,
    ): List<PayeeSpending> =
        transactions
            .filter {
                it.type == TransactionType.EXPENSE &&
                    it.date >= startDate && it.date <= endDate &&
                    it.deletedAt == null &&
                    it.status != TransactionStatus.VOID &&
                    !it.payee.isNullOrBlank()
            }
            .groupBy { it.payee!! }
            .map { (payee, txns) ->
                PayeeSpending(
                    payee = payee,
                    amount = Cents(txns.sumOf { it.amount.abs().amount }),
                    transactionCount = txns.size,
                )
            }
            .sortedByDescending { it.amount.amount }
            .take(TOP_PAYEES_COUNT)

    private companion object {
        /** Maximum number of top payees to display. */
        const val TOP_PAYEES_COUNT = 5
    }
}
