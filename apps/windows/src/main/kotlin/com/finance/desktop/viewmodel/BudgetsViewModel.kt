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
    val editingBudgetId: String? = null,
    val deletingBudgetId: String? = null,
    val editName: String = "",
    val editAmount: String = "",
    val editPeriod: BudgetPeriod = BudgetPeriod.MONTHLY,
)

/**
 * ViewModel for the Budgets screen.
 *
 * Loads budgets from the KMP shared [BudgetRepository] and computes
 * per-budget spending status using [BudgetCalculator] from `packages/core`.
 * Transactions are fetched from [TransactionRepository] and filtered by
 * each budget's category to produce accurate utilization numbers.
 *
 * Supports edit and delete operations with confirmation dialogs.
 */
class BudgetsViewModel(
    private val budgetRepository: BudgetRepository,
    private val transactionRepository: TransactionRepository,
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(BudgetsUiState())
    val uiState: StateFlow<BudgetsUiState> = _uiState.asStateFlow()

    private val hid = SyncId("d1")

    /** Cached raw budgets for edit operations. */
    private var rawBudgets: List<Budget> = emptyList()

    init {
        loadBudgets()
    }

    private fun loadBudgets() {
        viewModelScope.launch {
            val budgets = budgetRepository.observeAll(hid).first()
            rawBudgets = budgets
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

            _uiState.value = _uiState.value.copy(
                isLoading = false,
                budgets = items,
            )
        }
    }

    /**
     * Opens the edit dialog for a budget, pre-filling the current values.
     */
    fun startEdit(budgetId: String) {
        val budget = rawBudgets.find { it.id.value == budgetId } ?: return
        _uiState.value = _uiState.value.copy(
            editingBudgetId = budgetId,
            editName = budget.name,
            editAmount = (budget.amount.amount / 100.0).toString(),
            editPeriod = budget.period,
        )
    }

    /** Cancels the edit dialog. */
    fun cancelEdit() {
        _uiState.value = _uiState.value.copy(editingBudgetId = null)
    }

    /** Updates the edit form name field. */
    fun updateEditName(name: String) {
        _uiState.value = _uiState.value.copy(editName = name)
    }

    /** Updates the edit form amount field. */
    fun updateEditAmount(amount: String) {
        _uiState.value = _uiState.value.copy(editAmount = amount)
    }

    /** Updates the edit form period field. */
    fun updateEditPeriod(period: BudgetPeriod) {
        _uiState.value = _uiState.value.copy(editPeriod = period)
    }

    /** Saves the edited budget to the repository. */
    fun saveEdit() {
        val editingId = _uiState.value.editingBudgetId ?: return
        val budget = rawBudgets.find { it.id.value == editingId } ?: return
        val amountCents = ((_uiState.value.editAmount.toDoubleOrNull() ?: 0.0) * 100).toLong()

        viewModelScope.launch {
            budgetRepository.update(
                budget.copy(
                    name = _uiState.value.editName,
                    amount = com.finance.models.types.Cents(amountCents),
                    period = _uiState.value.editPeriod,
                ),
            )
            _uiState.value = _uiState.value.copy(editingBudgetId = null)
            loadBudgets()
        }
    }

    /** Shows the delete confirmation dialog for a budget. */
    fun confirmDelete(budgetId: String) {
        _uiState.value = _uiState.value.copy(deletingBudgetId = budgetId)
    }

    /** Cancels the delete confirmation. */
    fun cancelDelete() {
        _uiState.value = _uiState.value.copy(deletingBudgetId = null)
    }

    /** Deletes the budget from the repository after confirmation. */
    fun executeDelete() {
        val deletingId = _uiState.value.deletingBudgetId ?: return
        viewModelScope.launch {
            budgetRepository.delete(SyncId(deletingId))
            _uiState.value = _uiState.value.copy(deletingBudgetId = null)
            loadBudgets()
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
