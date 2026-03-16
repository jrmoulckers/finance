// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.data.repository.BudgetRepository
import com.finance.android.data.repository.CategoryRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.core.budget.BudgetCalculator
import com.finance.core.budget.BudgetHealth
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.BudgetPeriod
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
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

// TODO(#434): Replace with authenticated user's household ID
private val PLACEHOLDER_HOUSEHOLD_ID = SyncId("household-1")

/**
 * UI state for the Budgets screen.
 *
 * @property isLoading `true` during initial data load.
 * @property isRefreshing `true` while a pull-to-refresh is in progress.
 * @property errorMessage Non-null when data loading fails.
 * @property budgets Individual budget items with pre-formatted display values.
 * @property totalBudgeted Formatted sum of all budget limits.
 * @property totalSpent Formatted sum of spending across all budgets.
 * @property overallHealth Aggregate health derived from individual budget statuses.
 */
data class BudgetsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
    val budgets: List<BudgetItemUi> = emptyList(),
    val totalBudgeted: String = "",
    val totalSpent: String = "",
    val overallHealth: BudgetHealth = BudgetHealth.HEALTHY,
)

/**
 * Presentation model for a single budget row.
 *
 * All monetary fields are pre-formatted currency strings ready for display.
 *
 * @property id Stable sync identifier for list keying.
 * @property name Human-readable budget name.
 * @property categoryName Resolved category name.
 * @property categoryIcon Material icon name from the category, if available.
 * @property spent Formatted currency string of amount spent in the current period.
 * @property limit Formatted currency string of the budget cap.
 * @property remaining Formatted currency string of the amount remaining (signed).
 * @property utilizationPercent Fraction of budget consumed (0f–1.5f).
 * @property health Health level computed by [BudgetCalculator].
 * @property period The recurrence cadence of this budget.
 */
data class BudgetItemUi(
    val id: SyncId,
    val name: String,
    val categoryName: String,
    val categoryIcon: String?,
    val spent: String,
    val limit: String,
    val remaining: String,
    val utilizationPercent: Float,
    val health: BudgetHealth,
    val period: BudgetPeriod,
)

/**
 * ViewModel for the Budgets screen (#430).
 *
 * Loads all budgets, computes per-budget health via KMP [BudgetCalculator],
 * formats monetary values with KMP [CurrencyFormatter], and exposes a
 * reactive [BudgetsUiState] for the Compose UI layer.
 *
 * @param budgetRepository Source for budget data.
 * @param transactionRepository Source for transaction data used in spending calculation.
 * @param categoryRepository Source for category data used to resolve names and icons.
 */
class BudgetsViewModel(
    private val budgetRepository: BudgetRepository,
    private val transactionRepository: TransactionRepository,
    private val categoryRepository: CategoryRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(BudgetsUiState())
    val uiState: StateFlow<BudgetsUiState> = _uiState.asStateFlow()

    init { loadBudgets() }

    /** Trigger a pull-to-refresh cycle. */
    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }
            delay(800)
            loadData()
            _uiState.update { it.copy(isRefreshing = false) }
        }
    }

    /** Dismiss the current error message. */
    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    private fun loadBudgets() {
        viewModelScope.launch {
            delay(300)
            loadData()
            _uiState.update { it.copy(isLoading = false) }
        }
    }

    private suspend fun loadData() {
        try {
            val budgets = budgetRepository.observeAll(PLACEHOLDER_HOUSEHOLD_ID).first()
            val transactions = transactionRepository.observeAll(PLACEHOLDER_HOUSEHOLD_ID).first()
            val categories = categoryRepository.observeAll(PLACEHOLDER_HOUSEHOLD_ID).first()
            val categoryMap = categories.associateBy { it.id }

            val currency = Currency.USD
            val today = Clock.System.now()
                .toLocalDateTime(TimeZone.currentSystemDefault()).date

            var totalBudgetedCents = 0L
            var totalSpentCents = 0L

            val budgetItems = budgets.map { budget ->
                val catTxns = transactions.filter { it.categoryId == budget.categoryId }
                val status = BudgetCalculator.calculateStatus(budget, catTxns, today)
                val cat = categoryMap[budget.categoryId]

                totalBudgetedCents += budget.amount.amount
                totalSpentCents += status.spent.amount

                BudgetItemUi(
                    id = budget.id,
                    name = budget.name,
                    categoryName = cat?.name ?: "Uncategorized",
                    categoryIcon = cat?.icon,
                    spent = CurrencyFormatter.format(status.spent, currency),
                    limit = CurrencyFormatter.format(budget.amount, currency),
                    remaining = CurrencyFormatter.format(
                        status.remaining,
                        currency,
                        showSign = true,
                    ),
                    utilizationPercent = status.utilization.toFloat().coerceIn(0f, 1.5f),
                    health = status.healthLevel,
                    period = budget.period,
                )
            }

            val overallHealth = when {
                budgetItems.any { it.health == BudgetHealth.OVER } -> BudgetHealth.OVER
                budgetItems.any { it.health == BudgetHealth.WARNING } -> BudgetHealth.WARNING
                else -> BudgetHealth.HEALTHY
            }

            _uiState.update {
                it.copy(
                    budgets = budgetItems,
                    totalBudgeted = CurrencyFormatter.format(
                        Cents(totalBudgetedCents),
                        currency,
                    ),
                    totalSpent = CurrencyFormatter.format(
                        Cents(totalSpentCents),
                        currency,
                    ),
                    overallHealth = overallHealth,
                    errorMessage = null,
                )
            }
        } catch (e: Exception) {
            _uiState.update {
                it.copy(errorMessage = e.message ?: "Failed to load budgets")
            }
        }
    }
}
