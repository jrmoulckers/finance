// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.data.repository.*
import com.finance.core.aggregation.FinancialAggregator
import com.finance.core.budget.BudgetCalculator
import com.finance.core.budget.BudgetHealth
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.Transaction
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.datetime.*

data class BudgetStatusUi(
    val name: String,
    val spent: String,
    val limit: String,
    val utilizationPercent: Float,
    val health: BudgetHealth,
)

data class DashboardUiState(
    val isLoading: Boolean = true,
    val netWorthFormatted: String = "",
    val todaySpendingFormatted: String = "",
    val monthlySpendingFormatted: String = "",
    val budgetStatuses: List<BudgetStatusUi> = emptyList(),
    val recentTransactions: List<Transaction> = emptyList(),
)

class DashboardViewModel(
    private val accountRepository: AccountRepository,
    private val transactionRepository: TransactionRepository,
    private val budgetRepository: BudgetRepository,
) : DesktopViewModel() {
    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()
    private val hid = SyncId("d1")
    init { loadDashboard() }

    private fun loadDashboard() {
        viewModelScope.launch {
            val accounts = accountRepository.observeAll(hid).first()
            val transactions = transactionRepository.observeAll(hid).first()
            val budgets = budgetRepository.observeAll(hid).first()
            val currency = Currency.USD
            val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
            val netWorth = FinancialAggregator.netWorth(accounts)
            val todaySpending = FinancialAggregator.totalSpending(transactions, today, today)
            val monthStart = LocalDate(today.year, today.month, 1)
            val monthlySpending = FinancialAggregator.totalSpending(transactions, monthStart, today)
            val budgetStatuses = budgets.map { budget ->
                val catTxns = transactions.filter { it.categoryId == budget.categoryId }
                val status = BudgetCalculator.calculateStatus(budget, catTxns, today)
                BudgetStatusUi(name = budget.name, spent = CurrencyFormatter.format(status.spent, currency),
                    limit = CurrencyFormatter.format(budget.amount, currency), utilizationPercent = status.utilization.toFloat().coerceIn(0f, 1.5f),
                    health = status.healthLevel)
            }
            val recent = transactions.sortedByDescending { it.date }.take(5)
            _uiState.value = DashboardUiState(isLoading = false, netWorthFormatted = CurrencyFormatter.format(netWorth, currency),
                todaySpendingFormatted = CurrencyFormatter.format(todaySpending, currency),
                monthlySpendingFormatted = CurrencyFormatter.format(monthlySpending, currency),
                budgetStatuses = budgetStatuses, recentTransactions = recent)
        }
    }
}
