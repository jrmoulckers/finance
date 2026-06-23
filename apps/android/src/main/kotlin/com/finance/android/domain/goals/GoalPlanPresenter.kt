// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.domain.goals

import com.finance.core.currency.CurrencyFormatter
import com.finance.models.Goal
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate

/**
 * Fully formatted, render-ready view of a goal's savings plan.
 *
 * Every monetary and date value is pre-formatted so the Compose / Glance layer
 * never touches [Cents], [CurrencyFormatter], or date maths.
 *
 * @property goalId Stable identifier for keyed lists / navigation.
 * @property goalName User-facing goal name.
 * @property icon Optional emoji / icon for the goal.
 * @property progressPercent Fraction of target reached, 0.0–1.0.
 * @property progressPercentInt Whole-number progress (0–100).
 * @property currentFormatted Formatted saved amount.
 * @property targetFormatted Formatted target amount.
 * @property remainingFormatted Formatted remaining amount.
 * @property perWeekFormatted Suggested weekly save amount, formatted.
 * @property perPaycheckFormatted Suggested per-paycheck save amount, formatted.
 * @property perMonthFormatted Suggested monthly save amount, formatted.
 * @property buyByLabel Short month/year buy-by label (e.g. "Aug 2027"), or null.
 * @property headline Teen-friendly hero line.
 * @property paceMessage Short on-track / catch-up message.
 * @property milestoneLabel Motivating milestone label.
 * @property milestonePercent Milestone checkpoint percent (0/25/50/75/100).
 * @property pace Raw pace classification for icon / semantics selection.
 * @property isBehind Whether the saver needs to catch up.
 * @property isComplete Whether the goal is reached.
 * @property catchUpPerWeekFormatted Formatted catch-up weekly amount, when behind.
 * @property hasPlan Whether actionable per-week numbers are available.
 */
data class GoalPlanUi(
    val goalId: SyncId,
    val goalName: String,
    val icon: String?,
    val progressPercent: Float,
    val progressPercentInt: Int,
    val currentFormatted: String,
    val targetFormatted: String,
    val remainingFormatted: String,
    val perWeekFormatted: String,
    val perPaycheckFormatted: String,
    val perMonthFormatted: String,
    val buyByLabel: String?,
    val headline: String,
    val paceMessage: String,
    val milestoneLabel: String,
    val milestonePercent: Int,
    val pace: GoalPace,
    val isBehind: Boolean,
    val isComplete: Boolean,
    val catchUpPerWeekFormatted: String?,
    val hasPlan: Boolean,
)

/**
 * Turns a [Goal] into a render-ready [GoalPlanUi] by combining the pure
 * [GoalPlanner] maths with [GoalPlanCopy] phrasing and currency/date formatting.
 *
 * Kept free of Android, coroutine, and ViewModel dependencies so it can be unit
 * tested directly on the JVM.
 */
object GoalPlanPresenter {

    private val monthAbbreviations = listOf(
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    )

    /**
     * Presents [goal] as of [today] in [currency].
     *
     * @param actualPerWeekCents Optional known weekly contribution to enable
     *   ahead/behind pacing; `null` shows the required-pace plan.
     */
    fun present(
        goal: Goal,
        today: LocalDate,
        currency: Currency,
        actualPerWeekCents: Long? = null,
    ): GoalPlanUi {
        val plan = GoalPlanner.plan(
            targetCents = goal.targetAmount.amount,
            currentCents = goal.currentAmount.amount,
            today = today,
            targetDate = goal.targetDate,
            actualPerWeekCents = actualPerWeekCents,
        )

        val buyByLabel = plan.projectedDate?.let { monthYearLabel(it) }
        val perWeekFormatted = format(plan.perWeekCents, currency)
        val catchUpFormatted = plan.catchUpPerWeekCents?.let { format(it, currency) }
        val hasPlan = plan.perWeekCents > 0L && !plan.isComplete

        return GoalPlanUi(
            goalId = goal.id,
            goalName = goal.name,
            icon = goal.icon,
            progressPercent = plan.run {
                val fraction = (goal.targetAmount.amount - remainingCents).toDouble() /
                    goal.targetAmount.amount.toDouble()
                fraction.coerceIn(0.0, 1.0).toFloat()
            },
            progressPercentInt = progressPercentInt(goal),
            currentFormatted = format(goal.currentAmount.amount, currency),
            targetFormatted = format(goal.targetAmount.amount, currency),
            remainingFormatted = format(plan.remainingCents, currency),
            perWeekFormatted = perWeekFormatted,
            perPaycheckFormatted = format(plan.perPaycheckCents, currency),
            perMonthFormatted = format(plan.perMonthCents, currency),
            buyByLabel = buyByLabel,
            headline = GoalPlanCopy.headline(perWeekFormatted, goal.name, buyByLabel),
            paceMessage = GoalPlanCopy.paceMessage(
                pace = plan.pace,
                goalName = goal.name,
                buyByLabel = buyByLabel,
                catchUpPerWeekFormatted = catchUpFormatted,
            ),
            milestoneLabel = GoalPlanCopy.milestoneLabel(plan.milestone),
            milestonePercent = GoalPlanCopy.milestonePercent(plan.milestone),
            pace = plan.pace,
            isBehind = plan.pace == GoalPace.BEHIND || plan.pace == GoalPace.OVERDUE,
            isComplete = plan.isComplete,
            catchUpPerWeekFormatted = catchUpFormatted,
            hasPlan = hasPlan,
        )
    }

    private fun progressPercentInt(goal: Goal): Int {
        val target = goal.targetAmount.amount
        if (target <= 0L) return 0
        val fraction = goal.currentAmount.amount.toDouble() / target.toDouble()
        return (fraction.coerceIn(0.0, 1.0) * 100).toInt()
    }

    private fun format(cents: Long, currency: Currency): String =
        CurrencyFormatter.format(Cents(cents), currency)

    /** Formats a date as a short month/year label, e.g. "Aug 2027". */
    fun monthYearLabel(date: LocalDate): String {
        val month = monthAbbreviations[date.monthNumber - 1]
        return "$month ${date.year}"
    }
}
