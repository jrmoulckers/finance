// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.domain.goals

import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.daysUntil
import kotlinx.datetime.plus

/**
 * How a goal is tracking against its deadline (or lack of one).
 *
 * Used to drive teen-friendly copy and visuals — never relies on colour alone.
 */
enum class GoalPace {
    /** Target amount already reached. */
    COMPLETE,

    /** No target date set, so there is nothing to pace against yet. */
    NO_DEADLINE,

    /** Saving the entered rate finishes comfortably before the deadline. */
    AHEAD,

    /** Saving the entered rate lands on/near the deadline. */
    ON_TRACK,

    /** Saving the entered rate finishes after the deadline — needs a catch-up. */
    BEHIND,

    /** The deadline is today or in the past and the goal is not met. */
    OVERDUE,
}

/**
 * Motivational checkpoint a goal has reached, classified from progress fraction.
 */
enum class GoalMilestone {
    /** 0% up to (but not including) 25%. */
    STARTED,

    /** 25% up to (but not including) 50%. */
    QUARTER,

    /** 50% up to (but not including) 75%. */
    HALF,

    /** 75% up to (but not including) 100%. */
    THREE_QUARTER,

    /** 100% — goal reached. */
    COMPLETE,
}

/**
 * A deterministic savings plan for a single goal.
 *
 * All monetary values are in whole cents ([Long]) so callers can format them
 * with the shared `CurrencyFormatter`. Required per-period amounts are rounded
 * **up** so that saving the suggested amount always reaches the target on time.
 *
 * @property remainingCents Amount still needed to reach the target (never negative).
 * @property perWeekCents Suggested weekly savings to hit the target by [targetDate].
 * @property perPaycheckCents Suggested per-paycheck (biweekly) savings.
 * @property perMonthCents Suggested monthly savings.
 * @property weeksRemaining Whole weeks until [targetDate], or `null` when there is
 *   no deadline and no save rate to project from.
 * @property projectedDate The date the goal is expected to be reached. When a
 *   deadline exists this equals [targetDate]; otherwise it is derived from the
 *   provided save rate. `null` when neither is available.
 * @property targetDate The user's chosen deadline, echoed for convenience.
 * @property milestone The checkpoint currently reached.
 * @property pace How the goal is tracking — see [GoalPace].
 * @property catchUpPerWeekCents When [pace] is [GoalPace.BEHIND] or
 *   [GoalPace.OVERDUE], the weekly amount required to still hit the deadline;
 *   `null` otherwise.
 * @property isComplete Whether the target has been reached.
 */
data class GoalPlan(
    val remainingCents: Long,
    val perWeekCents: Long,
    val perPaycheckCents: Long,
    val perMonthCents: Long,
    val weeksRemaining: Int?,
    val projectedDate: LocalDate?,
    val targetDate: LocalDate?,
    val milestone: GoalMilestone,
    val pace: GoalPace,
    val catchUpPerWeekCents: Long?,
    val isComplete: Boolean,
)

/**
 * Pure, deterministic goal-planning calculator.
 *
 * Owns the maths behind the teen savings planner: turning a target amount and
 * deadline into a "save $X/week" figure, projecting a buy-by date from a save
 * rate, classifying milestones, and judging behind/ahead pace. No Android,
 * coroutine, or formatting dependencies — fully unit testable on the JVM.
 *
 * Period maths use fixed planning approximations so results are stable:
 * - 7 days per week
 * - 14 days per paycheck (biweekly)
 * - ~30.44 days per month (365 / 12)
 *
 * Required per-period amounts always round **up** so the saver is never short.
 */
object GoalPlanner {

    private const val DAYS_PER_WEEK = 7
    private const val DAYS_PER_PAYCHECK = 14
    private const val WEEKS_PER_YEAR = 52L
    private const val MONTHS_PER_YEAR = 12L

    /** Average days per month (365 / 12), scaled by 100 for integer division. */
    private const val DAYS_PER_MONTH_X100 = 3044L

    /** A save rate finishing this many days early or more is considered AHEAD. */
    private const val AHEAD_MARGIN_DAYS = 7

    /**
     * Builds a full [GoalPlan] for a goal.
     *
     * @param targetCents Target amount in cents (must be > 0).
     * @param currentCents Amount already saved in cents (clamped to ≥ 0).
     * @param today The reference "now" date for all projections.
     * @param targetDate The chosen deadline, or `null` for an open-ended goal.
     * @param actualPerWeekCents The saver's real weekly contribution, when known.
     *   Enables pace classification and (for open-ended goals) a projected date.
     * @throws IllegalArgumentException if [targetCents] is not positive.
     */
    fun plan(
        targetCents: Long,
        currentCents: Long,
        today: LocalDate,
        targetDate: LocalDate?,
        actualPerWeekCents: Long? = null,
    ): GoalPlan {
        require(targetCents > 0) { "Goal target must be positive" }

        val current = currentCents.coerceAtLeast(0L)
        val remaining = (targetCents - current).coerceAtLeast(0L)
        val milestone = milestoneFor(current, targetCents)

        if (remaining == 0L) {
            return GoalPlan(
                remainingCents = 0L,
                perWeekCents = 0L,
                perPaycheckCents = 0L,
                perMonthCents = 0L,
                weeksRemaining = 0,
                projectedDate = today,
                targetDate = targetDate,
                milestone = GoalMilestone.COMPLETE,
                pace = GoalPace.COMPLETE,
                catchUpPerWeekCents = null,
                isComplete = true,
            )
        }

        return if (targetDate != null) {
            planWithDeadline(remaining, today, targetDate, milestone, actualPerWeekCents)
        } else {
            planOpenEnded(remaining, today, milestone, actualPerWeekCents)
        }
    }

    private fun planWithDeadline(
        remaining: Long,
        today: LocalDate,
        targetDate: LocalDate,
        milestone: GoalMilestone,
        actualPerWeekCents: Long?,
    ): GoalPlan {
        val days = today.daysUntil(targetDate)

        if (days <= 0) {
            // Deadline today or already passed and goal unmet.
            return GoalPlan(
                remainingCents = remaining,
                perWeekCents = remaining,
                perPaycheckCents = remaining,
                perMonthCents = remaining,
                weeksRemaining = 0,
                projectedDate = actualPerWeekCents
                    ?.takeIf { it > 0 }
                    ?.let { projectedDate(remaining, it, today) },
                targetDate = targetDate,
                milestone = milestone,
                pace = GoalPace.OVERDUE,
                catchUpPerWeekCents = remaining,
                isComplete = false,
            )
        }

        val weeks = ceilDiv(days.toLong(), DAYS_PER_WEEK.toLong())
        val paychecks = ceilDiv(days.toLong(), DAYS_PER_PAYCHECK.toLong())
        val months = monthsBetween(days)

        val perWeek = ceilDiv(remaining, weeks)
        val perPaycheck = ceilDiv(remaining, paychecks)
        val perMonth = ceilDiv(remaining, months)

        val (pace, catchUp, projected) = assessPace(
            remaining = remaining,
            today = today,
            targetDate = targetDate,
            requiredPerWeek = perWeek,
            actualPerWeekCents = actualPerWeekCents,
        )

        return GoalPlan(
            remainingCents = remaining,
            perWeekCents = perWeek,
            perPaycheckCents = perPaycheck,
            perMonthCents = perMonth,
            weeksRemaining = weeks.toInt(),
            projectedDate = projected,
            targetDate = targetDate,
            milestone = milestone,
            pace = pace,
            catchUpPerWeekCents = catchUp,
            isComplete = false,
        )
    }

    private fun planOpenEnded(
        remaining: Long,
        today: LocalDate,
        milestone: GoalMilestone,
        actualPerWeekCents: Long?,
    ): GoalPlan {
        val rate = actualPerWeekCents?.takeIf { it > 0 }
        if (rate == null) {
            // No deadline and no save rate — nothing to pace against yet.
            return GoalPlan(
                remainingCents = remaining,
                perWeekCents = 0L,
                perPaycheckCents = 0L,
                perMonthCents = 0L,
                weeksRemaining = null,
                projectedDate = null,
                targetDate = null,
                milestone = milestone,
                pace = GoalPace.NO_DEADLINE,
                catchUpPerWeekCents = null,
                isComplete = false,
            )
        }

        val weeks = ceilDiv(remaining, rate)
        // Monthly equivalent of a weekly rate: rate * 52 / 12, rounded up.
        val perMonth = ceilDiv(rate * WEEKS_PER_YEAR, MONTHS_PER_YEAR)
        return GoalPlan(
            remainingCents = remaining,
            perWeekCents = rate,
            perPaycheckCents = rate * 2L,
            perMonthCents = perMonth,
            weeksRemaining = weeks.toInt(),
            projectedDate = projectedDate(remaining, rate, today),
            targetDate = null,
            milestone = milestone,
            pace = GoalPace.ON_TRACK,
            catchUpPerWeekCents = null,
            isComplete = false,
        )
    }

    /**
     * Projects the date a goal is reached when saving [perWeekCents] each week.
     *
     * @return The expected completion date, or `null` if [perWeekCents] ≤ 0.
     */
    fun projectedDate(remainingCents: Long, perWeekCents: Long, today: LocalDate): LocalDate? {
        if (perWeekCents <= 0L) return null
        if (remainingCents <= 0L) return today
        val weeks = ceilDiv(remainingCents, perWeekCents)
        return today.plus(weeks * DAYS_PER_WEEK, DateTimeUnit.DAY)
    }

    /**
     * The weekly amount required to reach [remainingCents] by [targetDate] from
     * [today], rounded up. Returns [remainingCents] if the deadline is now/past.
     */
    fun requiredPerWeek(remainingCents: Long, today: LocalDate, targetDate: LocalDate): Long {
        if (remainingCents <= 0L) return 0L
        val days = today.daysUntil(targetDate)
        if (days <= 0) return remainingCents
        val weeks = ceilDiv(days.toLong(), DAYS_PER_WEEK.toLong())
        return ceilDiv(remainingCents, weeks)
    }

    /**
     * Classifies the milestone reached from saved vs. target amount.
     */
    fun milestoneFor(currentCents: Long, targetCents: Long): GoalMilestone {
        if (targetCents <= 0L) return GoalMilestone.STARTED
        val fraction = currentCents.toDouble() / targetCents.toDouble()
        return when {
            fraction >= 1.0 -> GoalMilestone.COMPLETE
            fraction >= 0.75 -> GoalMilestone.THREE_QUARTER
            fraction >= 0.50 -> GoalMilestone.HALF
            fraction >= 0.25 -> GoalMilestone.QUARTER
            else -> GoalMilestone.STARTED
        }
    }

    private fun assessPace(
        remaining: Long,
        today: LocalDate,
        targetDate: LocalDate,
        requiredPerWeek: Long,
        actualPerWeekCents: Long?,
    ): Triple<GoalPace, Long?, LocalDate?> {
        val rate = actualPerWeekCents?.takeIf { it > 0 }
            ?: return Triple(GoalPace.ON_TRACK, null, targetDate)

        val projected = projectedDate(remaining, rate, today) ?: targetDate
        val slackDays = targetDate.daysUntil(projected) // > 0 means finishing late
        return when {
            slackDays <= -AHEAD_MARGIN_DAYS -> Triple(GoalPace.AHEAD, null, projected)
            slackDays <= 0 -> Triple(GoalPace.ON_TRACK, null, projected)
            else -> Triple(GoalPace.BEHIND, requiredPerWeek, projected)
        }
    }

    /** Whole months represented by [days], using the 365/12 average, min 1. */
    private fun monthsBetween(days: Int): Long {
        val months = ceilDiv(days.toLong() * 100L, DAYS_PER_MONTH_X100)
        return months.coerceAtLeast(1L)
    }

    /** Ceiling integer division for non-negative longs; [divisor] must be > 0. */
    private fun ceilDiv(value: Long, divisor: Long): Long {
        require(divisor > 0L) { "divisor must be positive" }
        if (value <= 0L) return 0L
        return (value + divisor - 1L) / divisor
    }
}
