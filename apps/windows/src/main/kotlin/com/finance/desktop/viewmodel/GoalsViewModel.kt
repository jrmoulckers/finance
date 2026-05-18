// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.core.currency.CurrencyFormatter
import com.finance.desktop.data.repository.GoalRepository
import com.finance.models.Goal
import com.finance.models.GoalStatus
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * UI model for a single savings goal card in the Goals screen.
 *
 * All monetary values are pre-formatted strings so the UI layer never
 * performs currency arithmetic — that lives in the KMP shared model.
 */
data class GoalItemUi(
    val id: String,
    val name: String,
    val currentAmount: String,
    val targetAmount: String,
    val progress: Float,
    val deadline: String?,
    val status: GoalStatus,
)

data class GoalsUiState(
    val isLoading: Boolean = true,
    val goals: List<GoalItemUi> = emptyList(),
    val editingGoalId: String? = null,
    val deletingGoalId: String? = null,
    val editName: String = "",
    val editTargetAmount: String = "",
    val editCurrentAmount: String = "",
)

/**
 * ViewModel for the Goals screen.
 *
 * Loads savings goals from the KMP shared [GoalRepository] and maps
 * them to display-ready [GoalItemUi] instances. Progress is computed
 * by the KMP [Goal.progress] property — no duplicate logic here.
 *
 * Supports edit and delete operations with confirmation dialogs.
 */
class GoalsViewModel(
    private val goalRepository: GoalRepository,
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(GoalsUiState())
    val uiState: StateFlow<GoalsUiState> = _uiState.asStateFlow()

    private val hid = SyncId("d1")

    /** Cached raw goals for edit operations. */
    private var rawGoals: List<Goal> = emptyList()

    init {
        loadGoals()
    }

    private fun loadGoals() {
        viewModelScope.launch {
            val goals = goalRepository.observeAll(hid).first()
            rawGoals = goals
            val currency = Currency.USD

            val items = goals.map { goal ->
                GoalItemUi(
                    id = goal.id.value,
                    name = goal.name,
                    currentAmount = CurrencyFormatter.format(
                        goal.currentAmount, currency,
                    ),
                    targetAmount = CurrencyFormatter.format(
                        goal.targetAmount, currency,
                    ),
                    progress = goal.progress.toFloat(),
                    deadline = goal.targetDate?.toString(),
                    status = goal.status,
                )
            }

            _uiState.value = _uiState.value.copy(
                isLoading = false,
                goals = items,
            )
        }
    }

    /**
     * Opens the edit dialog for a goal, pre-filling the current values.
     */
    fun startEdit(goalId: String) {
        val goal = rawGoals.find { it.id.value == goalId } ?: return
        _uiState.value = _uiState.value.copy(
            editingGoalId = goalId,
            editName = goal.name,
            editTargetAmount = (goal.targetAmount.amount / 100.0).toString(),
            editCurrentAmount = (goal.currentAmount.amount / 100.0).toString(),
        )
    }

    /** Cancels the edit dialog. */
    fun cancelEdit() {
        _uiState.value = _uiState.value.copy(editingGoalId = null)
    }

    /** Updates the edit form name field. */
    fun updateEditName(name: String) {
        _uiState.value = _uiState.value.copy(editName = name)
    }

    /** Updates the edit form target amount field. */
    fun updateEditTargetAmount(amount: String) {
        _uiState.value = _uiState.value.copy(editTargetAmount = amount)
    }

    /** Updates the edit form current amount field. */
    fun updateEditCurrentAmount(amount: String) {
        _uiState.value = _uiState.value.copy(editCurrentAmount = amount)
    }

    /** Saves the edited goal to the repository. */
    fun saveEdit() {
        val editingId = _uiState.value.editingGoalId ?: return
        val goal = rawGoals.find { it.id.value == editingId } ?: return
        val targetCents = ((_uiState.value.editTargetAmount.toDoubleOrNull() ?: 0.0) * 100).toLong()
        val currentCents = ((_uiState.value.editCurrentAmount.toDoubleOrNull() ?: 0.0) * 100).toLong()

        viewModelScope.launch {
            goalRepository.update(
                goal.copy(
                    name = _uiState.value.editName,
                    targetAmount = com.finance.models.types.Cents(targetCents),
                    currentAmount = com.finance.models.types.Cents(currentCents),
                ),
            )
            _uiState.value = _uiState.value.copy(editingGoalId = null)
            loadGoals()
        }
    }

    /** Shows the delete confirmation dialog for a goal. */
    fun confirmDelete(goalId: String) {
        _uiState.value = _uiState.value.copy(deletingGoalId = goalId)
    }

    /** Cancels the delete confirmation. */
    fun cancelDelete() {
        _uiState.value = _uiState.value.copy(deletingGoalId = null)
    }

    /** Deletes the goal from the repository after confirmation. */
    fun executeDelete() {
        val deletingId = _uiState.value.deletingGoalId ?: return
        viewModelScope.launch {
            goalRepository.delete(SyncId(deletingId))
            _uiState.value = _uiState.value.copy(deletingGoalId = null)
            loadGoals()
        }
    }
}
