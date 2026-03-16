// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.BudgetRepository
import com.finance.android.data.repository.CategoryRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.core.aggregation.FinancialAggregator
import com.finance.core.budget.BudgetCalculator
import com.finance.core.budget.BudgetHealth
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.Transaction
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

// TODO(#434): Replace with authenticated user's household ID
private val PLACEHOLDER_HOUSEHOLD_ID = SyncId("household-1")

data class DashboardUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val netWorth: Cents = Cents.ZERO,
    val netWorthFormatted: String = "",
    val todaySpending: Cents = Cents.ZERO,
    val todaySpendingFormatted: String = "",
    val monthlySpending: Cents = Cents.ZERO,
    val monthlySpendingFormatted: String = "",
    val budgetStatuses: List<BudgetStatusUi> = emptyList(),
    val recentTransactions: List<Transaction> = emptyList(),
    val currency: Currency = Currency.USD,
)

data class BudgetStatusUi(
    val name: String,
    val spent: String,
    val limit: String,
    val remaining: String,
    val utilizationPercent: Float,
    val health: BudgetHealth,
    val categoryIcon: String?,
)

/**
 * ViewModel for the Dashboard screen (#19).
 * Loads net worth, spending, budget summaries, and recent transactions
 * using KMP shared logic from packages/core.
 *
 * @param accountRepository Source for account data used in net-worth calculation.
 * @param transactionRepository Source for transaction data used in spending aggregation.
 * @param budgetRepository Source for budget data used in budget-status cards.
 * @param categoryRepository Source for category data used to resolve budget icons.
 */
class DashboardViewModel(
    private val accountRepository: AccountRepository,
    private val transactionRepository: TransactionRepository,
    private val budgetRepository: BudgetRepository,
    private val categoryRepository: CategoryRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init { loadDashboard() }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }
            delay(800)
            loadData()
            _uiState.update { it.copy(isRefreshing = false) }
        }
    }

    private fun loadDashboard() {
        viewModelScope.launch {
            delay(300)
            loadData()
            _uiState.update { it.copy(isLoading = false) }
        }
    }

    private suspend fun loadData() {
        val accounts = accountRepository.observeAll(PLACEHOLDER_HOUSEHOLD_ID).first()
        val transactions = transactionRepository.observeAll(PLACEHOLDER_HOUSEHOLD_ID).first()
        val budgets = budgetRepository.observeAll(PLACEHOLDER_HOUSEHOLD_ID).first()
        val categories = categoryRepository.observeAll(PLACEHOLDER_HOUSEHOLD_ID).first()
        val categoryMap = categories.associateBy { it.id }

        val currency = Currency.USD
        val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
        val netWorth = FinancialAggregator.netWorth(accounts)
        val todaySpending = FinancialAggregator.totalSpending(transactions, today, today)
        val monthStart = LocalDate(today.year, today.month, 1)
        val monthlySpending = FinancialAggregator.totalSpending(transactions, monthStart, today)

        val budgetStatuses = budgets.map { budget ->
            val catTxns = transactions.filter { it.categoryId == budget.categoryId }
            val status = BudgetCalculator.calculateStatus(budget, catTxns, today)
            val cat = categoryMap[budget.categoryId]
            BudgetStatusUi(
                name = budget.name,
                spent = CurrencyFormatter.format(status.spent, currency),
                limit = CurrencyFormatter.format(budget.amount, currency),
                remaining = CurrencyFormatter.format(status.remaining, currency, showSign = true),
                utilizationPercent = status.utilization.toFloat().coerceIn(0f, 1.5f),
                health = status.healthLevel,
                categoryIcon = cat?.icon,
            )
        }

        val recentTransactions = transactions
            .sortedByDescending { it.date }
            .take(5)

        _uiState.update {
            it.copy(
                netWorth = netWorth,
                netWorthFormatted = CurrencyFormatter.format(netWorth, currency),
                todaySpending = todaySpending,
                todaySpendingFormatted = CurrencyFormatter.format(todaySpending, currency),
                monthlySpending = monthlySpending,
                monthlySpendingFormatted = CurrencyFormatter.format(monthlySpending, currency),
                budgetStatuses = budgetStatuses,
                recentTransactions = recentTransactions,
                currency = currency,
            )
        }
    }
}