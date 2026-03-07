package com.finance.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import com.finance.android.ui.data.SampleData
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.Goal
import com.finance.models.GoalStatus
import com.finance.models.types.Currency
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.daysUntil
import kotlinx.datetime.toLocalDateTime

// ── UI State Models ────────────────────────────────────────────────────

/**
 * Presentation-ready goal for the goal list.
 */
data class GoalUi(
    val id: String,
    val name: String,
    val icon: String,
    val currentAmountFormatted: String,
    val targetAmountFormatted: String,
    val progress: Float,
    val progressPercent: Int,
    val projectedCompletionDate: String,
    val daysRemaining: String,
    val status: GoalStatus,
    val accessibilityLabel: String,
    /** Contribution history as (label, value-in-dollars) pairs for trend chart. */
    val contributionHistory: List<Pair<String, Float>>,
    /** Raw goal model for detail screen. */
    val goal: Goal,
)

/**
 * Top-level UI state for the goals screen.
 */
data class GoalUiState(
    val goals: List<GoalUi> = emptyList(),
    val isLoading: Boolean = false,
)

// ── ViewModel ──────────────────────────────────────────────────────────

/**
 * ViewModel for the Goals screen (#45).
 *
 * Loads goals from [SampleData], calculates projected completion dates
 * based on contribution rate, and exposes presentation-ready state.
 */
class GoalViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(GoalUiState(isLoading = true))
    val uiState: StateFlow<GoalUiState> = _uiState.asStateFlow()

    private val currency = Currency.USD
    private val today = Clock.System.now()
        .toLocalDateTime(TimeZone.currentSystemDefault()).date

    init {
        loadGoals()
    }

    private fun loadGoals() {
        val goalUiList = SampleData.goals.map { goal -> mapToUi(goal) }
        _uiState.value = GoalUiState(goals = goalUiList, isLoading = false)
    }

    private fun mapToUi(goal: Goal): GoalUi {
        val currentFormatted = CurrencyFormatter.format(goal.currentAmount, currency)
        val targetFormatted = CurrencyFormatter.format(goal.targetAmount, currency)
        val progressPercent = (goal.progress * 100).toInt()

        // Calculate projected completion from average monthly contribution
        val contributions = SampleData.goalContributions[goal.id.value] ?: emptyList()
        val avgMonthly = if (contributions.isNotEmpty()) contributions.average().toLong() else 0L
        val projectedCompletion = calculateProjectedCompletion(goal, avgMonthly)
        val daysRemaining = calculateDaysRemaining(goal)

        val accessibilityLabel = buildString {
            append("${goal.name}: $progressPercent% complete, ")
            append("$currentFormatted of $targetFormatted")
            if (daysRemaining.isNotEmpty()) append(", $daysRemaining")
        }

        // Build contribution history for trend chart
        val monthLabels = listOf("Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
        val contributionHistory = contributions.mapIndexed { index, amount ->
            val label = monthLabels.getOrElse(index) { "M${index + 1}" }
            label to (amount.toFloat() / 100f)
        }

        return GoalUi(
            id = goal.id.value,
            name = goal.name,
            icon = goal.icon ?: "target",
            currentAmountFormatted = currentFormatted,
            targetAmountFormatted = targetFormatted,
            progress = goal.progress.toFloat(),
            progressPercent = progressPercent,
            projectedCompletionDate = projectedCompletion,
            daysRemaining = daysRemaining,
            status = goal.status,
            accessibilityLabel = accessibilityLabel,
            contributionHistory = contributionHistory,
            goal = goal,
        )
    }

    private fun calculateProjectedCompletion(goal: Goal, avgMonthly: Long): String {
        if (goal.isComplete) return "Completed"
        if (avgMonthly <= 0) return "Set contributions to project"

        val remaining = goal.targetAmount.amount - goal.currentAmount.amount
        val monthsNeeded = (remaining.toDouble() / avgMonthly).toInt() + 1
        val projectedMonth = today.monthNumber + monthsNeeded
        val projectedYear = today.year + (projectedMonth - 1) / 12
        val adjustedMonth = ((projectedMonth - 1) % 12) + 1

        val monthNames = listOf(
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        )
        return "${monthNames[adjustedMonth - 1]} $projectedYear"
    }

    private fun calculateDaysRemaining(goal: Goal): String {
        if (goal.isComplete) return "Complete"
        val targetDate = goal.targetDate ?: return ""
        val days = today.daysUntil(targetDate)
        return when {
            days < 0 -> "${-days} days overdue"
            days == 0 -> "Due today"
            days == 1 -> "1 day remaining"
            else -> "$days days remaining"
        }
    }
}
