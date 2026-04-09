// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.core.budget.BudgetCalculator
import com.finance.core.budget.BudgetHealth
import com.finance.core.currency.CurrencyFormatter
import com.finance.desktop.data.repository.BudgetRepository
import com.finance.desktop.data.repository.TransactionRepository
import com.finance.models.Budget
import com.finance.models.BudgetPeriod
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

/**
 * UI model for a single budget card in the Budgets screen.
 *
 * All monetary values are pre-formatted strings so the UI layer never
 * performs currency arithmetic — that lives in the KMP shared
 * [BudgetCalculator].
 */
data class BudgetItemUi(
    val id: String,
    val name: String,
    val spent: String,
    val limit: String,
    val remaining: String,
    val utilization: Float,
    val isOver: Boolean,
    val period: String,
    val health: BudgetHealth,
)

data class BudgetsUiState(
    val isLoading: Boolean = true,
    val budgets: List<BudgetItemUi> = emptyList(),
)

/**
 * ViewModel for the Budgets screen.
 *
 * Loads budgets from the KMP shared [BudgetRepository] and computes
 * per-budget spending status using [BudgetCalculator] from `packages/core`.
 * Transactions are fetched from [TransactionRepository] and filtered by
 * each budget's category to produce accurate utilization numbers.
 */
class BudgetsViewModel(
    private val budgetRepository: BudgetRepository,
    private val transactionRepository: TransactionRepository,
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(BudgetsUiState())
    val uiState: StateFlow<BudgetsUiState> = _uiState.asStateFlow()

    private val hid = SyncId("d1")

    init {
        loadBudgets()
    }

    private fun loadBudgets() {
        viewModelScope.launch {
            val budgets = budgetRepository.observeAll(hid).first()
            val transactions = transactionRepository.observeAll(hid).first()
            val today = Clock.System.now()
                .toLocalDateTime(TimeZone.currentSystemDefault()).date
            val currency = Currency.USD

            val items = budgets.map { budget ->
                val categoryTransactions = transactions.filter {
                    it.categoryId == budget.categoryId
                }
                val status = BudgetCalculator.calculateStatus(
                    budget, categoryTransactions, today,
                )
                val spentFormatted = CurrencyFormatter.format(status.spent, currency)
                val limitFormatted = CurrencyFormatter.format(budget.amount, currency)
                val utilization = status.utilization.toFloat().coerceIn(0f, 1.5f)
                val isOver = status.healthLevel == BudgetHealth.OVER
                val remainingCents = budget.amount.amount - status.spent.amount
                val remainingFormatted = if (remainingCents >= 0) {
                    "${CurrencyFormatter.format(
                        com.finance.models.types.Cents(remainingCents),
                        currency,
                    )} left"
                } else {
                    "${CurrencyFormatter.format(
                        com.finance.models.types.Cents(-remainingCents),
                        currency,
                    )} over"
                }

                BudgetItemUi(
                    id = budget.id.value,
                    name = budget.name,
                    spent = spentFormatted,
                    limit = limitFormatted,
                    remaining = remainingFormatted,
                    utilization = utilization,
                    isOver = isOver,
                    period = budget.period.displayName(),
                    health = status.healthLevel,
                )
            }

            _uiState.value = BudgetsUiState(
                isLoading = false,
                budgets = items,
            )
        }
    }
}

/**
 * Human-readable display name for a [BudgetPeriod].
 */
private fun BudgetPeriod.displayName(): String = when (this) {
    BudgetPeriod.WEEKLY -> "Weekly"
    BudgetPeriod.BIWEEKLY -> "Biweekly"
    BudgetPeriod.MONTHLY -> "Monthly"
    BudgetPeriod.QUARTERLY -> "Quarterly"
    BudgetPeriod.YEARLY -> "Yearly"
}
