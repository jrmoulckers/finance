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
)

/**
 * ViewModel for the Goals screen.
 *
 * Loads savings goals from the KMP shared [GoalRepository] and maps
 * them to display-ready [GoalItemUi] instances. Progress is computed
 * by the KMP [Goal.progress] property — no duplicate logic here.
 */
class GoalsViewModel(
    private val goalRepository: GoalRepository,
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(GoalsUiState())
    val uiState: StateFlow<GoalsUiState> = _uiState.asStateFlow()

    private val hid = SyncId("d1")

    init {
        loadGoals()
    }

    private fun loadGoals() {
        viewModelScope.launch {
            val goals = goalRepository.observeAll(hid).first()
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

            _uiState.value = GoalsUiState(
                isLoading = false,
                goals = items,
            )
        }
    }
}
