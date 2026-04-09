// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.auth.HouseholdIdProvider
import com.finance.android.data.repository.GoalRepository
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.GoalStatus
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
import timber.log.Timber

/**
 * UI state for the Goals screen.
 *
 * @property isLoading True during the initial data load.
 * @property isRefreshing True while a pull-to-refresh is in progress.
 * @property errorMessage Non-null when an error prevents displaying goals.
 * @property goals All non-deleted goals mapped to presentation models.
 * @property activeCount Number of goals with [GoalStatus.ACTIVE] status.
 * @property completedCount Number of goals with [GoalStatus.COMPLETED] status.
 */
data class GoalsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
    val goals: List<GoalItemUi> = emptyList(),
    val activeCount: Int = 0,
    val completedCount: Int = 0,
)

/**
 * Presentation model for a single goal shown in the Goals list.
 *
 * All monetary values are pre-formatted for direct rendering —
 * the composable layer never needs to touch [Cents] or [CurrencyFormatter].
 *
 * @property id Stable sync-safe identifier for keyed lists.
 * @property name User-facing goal name.
 * @property targetFormatted Formatted target amount (e.g. "$10,000.00").
 * @property currentFormatted Formatted current progress amount (e.g. "$3,500.00").
 * @property remainingFormatted Formatted remaining amount (e.g. "$6,500.00").
 * @property progressPercent Fraction of target reached, clamped 0.0–1.0.
 * @property targetDate Formatted target date string, or null if no deadline.
 * @property isCompleted True when current amount ≥ target amount.
 * @property icon Optional emoji or icon identifier for the goal.
 */
data class GoalItemUi(
    val id: SyncId,
    val name: String,
    val targetFormatted: String,
    val currentFormatted: String,
    val remainingFormatted: String,
    val progressPercent: Float,
    val targetDate: String?,
    val isCompleted: Boolean,
    val icon: String?,
)

/**
 * ViewModel for the Goals screen (#430).
 *
 * Loads all goals from [GoalRepository], maps them to [GoalItemUi] presentation
 * models with pre-formatted currency strings, and exposes a reactive [GoalsUiState]
 * for the composable layer. Supports pull-to-refresh and handles loading/error states.
 *
 * @param householdIdProvider Provides the authenticated user's household ID.
 * @param goalRepository Source for goal data.
 */
class GoalsViewModel(
    private val householdIdProvider: HouseholdIdProvider,
    private val goalRepository: GoalRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(GoalsUiState())
    val uiState: StateFlow<GoalsUiState> = _uiState.asStateFlow()

    init { loadGoals() }

    /** Triggers a pull-to-refresh cycle. */
    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }
            delay(600)
            loadData()
            _uiState.update { it.copy(isRefreshing = false) }
        }
    }

    private fun loadGoals() {
        viewModelScope.launch {
            delay(200)
            loadData()
            _uiState.update { it.copy(isLoading = false) }
        }
    }

    private suspend fun loadData() {
        try {
            val householdId = householdIdProvider.householdId.value ?: run {
                Timber.w("No household ID available — skipping goals load")
                return
            }
            val goals = goalRepository.observeAll(householdId).first()
            val currency = Currency.USD

            val goalItems = goals.map { goal ->
                val remaining = Cents(
                    (goal.targetAmount.amount - goal.currentAmount.amount).coerceAtLeast(0L),
                )
                GoalItemUi(
                    id = goal.id,
                    name = goal.name,
                    targetFormatted = CurrencyFormatter.format(goal.targetAmount, currency),
                    currentFormatted = CurrencyFormatter.format(goal.currentAmount, currency),
                    remainingFormatted = CurrencyFormatter.format(remaining, currency),
                    progressPercent = goal.progress.toFloat(),
                    targetDate = goal.targetDate?.let { formatDate(it) },
                    isCompleted = goal.isComplete,
                    icon = goal.icon,
                )
            }

            val activeCount = goals.count { it.status == GoalStatus.ACTIVE }
            val completedCount = goals.count { it.status == GoalStatus.COMPLETED }

            _uiState.update {
                it.copy(
                    goals = goalItems,
                    activeCount = activeCount,
                    completedCount = completedCount,
                    errorMessage = null,
                )
            }
        } catch (e: Exception) {
            _uiState.update {
                it.copy(errorMessage = "Unable to load goals. Pull down to retry.")
            }
        }
    }

    companion object {
        /**
         * Formats a [kotlinx.datetime.LocalDate] as "MMM dd, yyyy" (e.g. "Jun 15, 2025").
         * Uses multiplatform-safe string building — no java.text dependency.
         */
        fun formatDate(date: kotlinx.datetime.LocalDate): String {
            val month = date.month.name
                .lowercase()
                .replaceFirstChar { it.uppercase() }
                .take(3)
            return "$month ${date.dayOfMonth}, ${date.year}"
        }
    }
}
