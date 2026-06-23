// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.auth.HouseholdIdProvider
import com.finance.android.data.repository.GoalRepository
import com.finance.android.domain.goals.GoalPlanPresenter
import com.finance.android.domain.goals.GoalPlanUi
import com.finance.models.Goal
import com.finance.models.GoalStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import timber.log.Timber

/**
 * UI state for the teen savings goal planner screen (#2207).
 *
 * @property isLoading True during the initial data load.
 * @property errorMessage Non-null when an error prevents building a plan.
 * @property plan The render-ready plan for the highlighted goal, or `null`.
 * @property hasGoal Whether the household has at least one active goal.
 */
data class GoalPlannerUiState(
    val isLoading: Boolean = true,
    val errorMessage: String? = null,
    val plan: GoalPlanUi? = null,
    val hasGoal: Boolean = false,
)

/**
 * ViewModel for the teen savings goal planner (#2207).
 *
 * Selects the saver's most relevant active goal, runs it through the pure
 * [GoalPlanPresenter] to produce a "save $X/week … buy by [date]" plan with
 * milestone and pace messaging, and exposes a reactive [GoalPlannerUiState].
 *
 * Goal selection prefers the soonest deadline (most urgent), falling back to
 * the goal with the highest progress so the saver always sees momentum.
 *
 * @param householdIdProvider Provides the authenticated user's household ID.
 * @param goalRepository Source for goal data.
 * @param clock Injectable clock for deterministic "today" in tests.
 */
class GoalPlannerViewModel(
    private val householdIdProvider: HouseholdIdProvider,
    private val goalRepository: GoalRepository,
    private val clock: Clock = Clock.System,
) : ViewModel() {

    private val _uiState = MutableStateFlow(GoalPlannerUiState())
    val uiState: StateFlow<GoalPlannerUiState> = _uiState.asStateFlow()

    init { load() }

    /** Reloads the highlighted goal's plan. */
    fun refresh() = load()

    private fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            loadData()
            _uiState.update { it.copy(isLoading = false) }
        }
    }

    @Suppress("TooGenericExceptionCaught") // Multiple exception types possible
    private suspend fun loadData() {
        try {
            val householdId = householdIdProvider.householdId.value ?: run {
                Timber.w("No household ID available — skipping goal planner load")
                _uiState.update { it.copy(plan = null, hasGoal = false, errorMessage = null) }
                return
            }

            val goals = goalRepository.observeAll(householdId).first()
            val today: LocalDate = clock.todayIn(TimeZone.currentSystemDefault())
            val selected = selectTopGoal(goals)

            if (selected == null) {
                _uiState.update { it.copy(plan = null, hasGoal = false, errorMessage = null) }
                return
            }

            // NOTE: Per-week contribution tracking is not wired yet, so pace is
            // shown against the required plan rather than actual deposits.
            // TODO(human): wire real weekly contribution rate once the
            //  contributions feature lands so AHEAD/BEHIND reflects actual saving.
            val plan = GoalPlanPresenter.present(
                goal = selected,
                today = today,
                currency = selected.currency,
            )

            _uiState.update {
                it.copy(plan = plan, hasGoal = true, errorMessage = null)
            }
        } catch (e: Exception) {
            Timber.e(e, "Error building goal plan")
            _uiState.update {
                it.copy(errorMessage = "Couldn't build your plan. Pull down to retry.")
            }
        }
    }

    /**
     * Picks the goal to highlight: the soonest active deadline first, otherwise
     * the active goal closest to completion.
     */
    private fun selectTopGoal(goals: List<Goal>): Goal? {
        val active = goals.filter { it.status == GoalStatus.ACTIVE && !it.isComplete }
        if (active.isEmpty()) return null
        val withDeadline = active.filter { it.targetDate != null }
        return if (withDeadline.isNotEmpty()) {
            withDeadline.minByOrNull { it.targetDate!! }
        } else {
            active.maxByOrNull { it.progress }
        }
    }
}
