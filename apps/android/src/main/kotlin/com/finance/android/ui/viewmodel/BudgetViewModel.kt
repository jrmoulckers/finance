package com.finance.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import com.finance.android.ui.data.SampleData
import com.finance.core.budget.BudgetCalculator
import com.finance.core.budget.BudgetStatus
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

// ── UI State Models ────────────────────────────────────────────────────

/**
 * Presentation-ready budget status for a budget card on the Budgets screen.
 */
data class BudgetCardUi(
    val id: String,
    val categoryName: String,
    val categoryIcon: String,
    val budgetedAmountFormatted: String,
    val spentAmountFormatted: String,
    val remainingAmountFormatted: String,
    val utilization: Float,
    val isOverBudget: Boolean,
    val periodLabel: String,
    val accessibilityLabel: String,
    val spentCents: Long,
    val budgetedCents: Long,
)

/**
 * A month-over-month comparison item for a single category.
 */
data class MonthComparisonUi(
    val categoryName: String,
    val thisMonthAmount: Float,
    val lastMonthAmount: Float,
    val thisMonthFormatted: String,
    val lastMonthFormatted: String,
)

/**
 * Top-level UI state for the budgets screen.
 */
data class BudgetUiState(
    val budgets: List<BudgetCardUi> = emptyList(),
    val monthComparisons: List<MonthComparisonUi> = emptyList(),
    val selectedMonthLabel: String = "",
    val selectedYear: Int = 2025,
    val selectedMonth: Int = 1,
    val isLoading: Boolean = false,
)

// ── ViewModel ──────────────────────────────────────────────────────────

/**
 * ViewModel for the Budgets screen (#32).
 *
 * Loads budgets from [SampleData], calculates utilization via
 * [BudgetCalculator], and builds month-over-month comparisons.
 */
class BudgetViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(BudgetUiState(isLoading = true))
    val uiState: StateFlow<BudgetUiState> = _uiState.asStateFlow()

    private val currency = Currency.USD
    private val today = Clock.System.now()
        .toLocalDateTime(TimeZone.currentSystemDefault()).date

    init {
        loadBudgets(today.year, today.monthNumber)
    }

    /** Navigate to the previous month. */
    fun previousMonth() {
        val state = _uiState.value
        var month = state.selectedMonth - 1
        var year = state.selectedYear
        if (month < 1) { month = 12; year-- }
        loadBudgets(year, month)
    }

    /** Navigate to the next month. */
    fun nextMonth() {
        val state = _uiState.value
        var month = state.selectedMonth + 1
        var year = state.selectedYear
        if (month > 12) { month = 1; year++ }
        loadBudgets(year, month)
    }

    private fun loadBudgets(year: Int, month: Int) {
        val referenceDate = LocalDate(year, month, 15)
        val monthLabel = formatMonth(year, month)

        val budgets = SampleData.budgets
        val transactions = SampleData.transactions
        val lastMonthTxns = SampleData.lastMonthTransactions

        // Calculate current-month budget statuses via KMP BudgetCalculator
        val budgetStatuses = budgets.map { budget ->
            val categoryTxns = transactions.filter { it.categoryId == budget.categoryId }
            BudgetCalculator.calculateStatus(budget, categoryTxns, referenceDate)
        }

        val budgetUiList = budgetStatuses.map { status ->
            val category = SampleData.categoryMap[status.budget.categoryId]
            mapToCardUi(status, category?.name ?: "Unknown", category?.icon ?: "receipt")
        }

        // Build month-over-month comparison
        val comparisons = budgets.map { budget ->
            val currentSpent = transactions
                .filter { it.categoryId == budget.categoryId }
                .sumOf { it.amount.abs().amount }
            val lastSpent = lastMonthTxns
                .filter { it.categoryId == budget.categoryId }
                .sumOf { it.amount.abs().amount }

            MonthComparisonUi(
                categoryName = budget.name,
                thisMonthAmount = currentSpent.toFloat() / 100f,
                lastMonthAmount = lastSpent.toFloat() / 100f,
                thisMonthFormatted = CurrencyFormatter.format(Cents(currentSpent), currency),
                lastMonthFormatted = CurrencyFormatter.format(Cents(lastSpent), currency),
            )
        }

        _uiState.value = BudgetUiState(
            budgets = budgetUiList,
            monthComparisons = comparisons,
            selectedMonthLabel = monthLabel,
            selectedYear = year,
            selectedMonth = month,
            isLoading = false,
        )
    }

    private fun mapToCardUi(
        status: BudgetStatus,
        categoryName: String,
        categoryIcon: String,
    ): BudgetCardUi {
        val spentFormatted = CurrencyFormatter.format(status.spent, currency)
        val budgetedFormatted = CurrencyFormatter.format(status.budget.amount, currency)
        val remainingFormatted = if (status.isOverBudget) {
            val overAmount = status.spent - status.budget.amount
            "${CurrencyFormatter.format(overAmount, currency)} over"
        } else {
            "${CurrencyFormatter.format(status.remaining, currency)} left"
        }

        val pct = (status.utilization * 100).toInt()
        val accessibilityLabel = buildString {
            append("$categoryName budget: $pct% used, ")
            append("$spentFormatted of $budgetedFormatted, ")
            append(remainingFormatted)
        }

        return BudgetCardUi(
            id = status.budget.id.value,
            categoryName = categoryName,
            categoryIcon = categoryIcon,
            budgetedAmountFormatted = budgetedFormatted,
            spentAmountFormatted = spentFormatted,
            remainingAmountFormatted = remainingFormatted,
            utilization = status.utilization.toFloat(),
            isOverBudget = status.isOverBudget,
            periodLabel = status.budget.period.name.lowercase()
                .replaceFirstChar { it.uppercase() },
            accessibilityLabel = accessibilityLabel,
            spentCents = status.spent.amount,
            budgetedCents = status.budget.amount.amount,
        )
    }

    private fun formatMonth(year: Int, month: Int): String {
        val monthNames = listOf(
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December",
        )
        return "${monthNames[month - 1]} $year"
    }
}
