// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.domain.goals

/**
 * Builds plain-language, teen-friendly copy from a [GoalPlan].
 *
 * Pure and side-effect free: callers pass already-formatted money and date
 * strings (e.g. from `CurrencyFormatter` / a date formatter) so this helper
 * never depends on currency or locale machinery and stays unit testable.
 *
 * The phrasing deliberately avoids finance jargon — "Save $25/week to get your
 * car by Aug 2027" rather than "Required periodic contribution".
 */
object GoalPlanCopy {

    /**
     * The hero line a teen reads first, e.g.
     * "Save $25/week to get your Car by Aug 2027".
     *
     * @param perWeekFormatted Pre-formatted weekly amount (e.g. "$25").
     * @param goalName The goal's name (e.g. "Car").
     * @param buyByLabel Pre-formatted target/projected date (e.g. "Aug 2027"),
     *   or `null` when there is no date yet.
     */
    fun headline(perWeekFormatted: String, goalName: String, buyByLabel: String?): String =
        if (buyByLabel != null) {
            "Save $perWeekFormatted/week to get your $goalName by $buyByLabel"
        } else {
            "Save $perWeekFormatted/week toward your $goalName"
        }

    /**
     * A short pace message answering "am I on track / can I still go out?".
     *
     * @param pace The classified pace from [GoalPlanner].
     * @param goalName The goal's name.
     * @param buyByLabel Projected/target date label, when available.
     * @param catchUpPerWeekFormatted Pre-formatted catch-up weekly amount, used
     *   for [GoalPace.BEHIND] / [GoalPace.OVERDUE].
     */
    fun paceMessage(
        pace: GoalPace,
        goalName: String,
        buyByLabel: String?,
        catchUpPerWeekFormatted: String?,
    ): String = when (pace) {
        GoalPace.COMPLETE ->
            "🎉 Done! You saved enough for your $goalName."
        GoalPace.NO_DEADLINE ->
            "Add a date or a weekly amount and we'll show your buy-by date."
        GoalPace.AHEAD ->
            "You're ahead of schedule" +
                (buyByLabel?.let { " — on track for $it." } ?: ".")
        GoalPace.ON_TRACK ->
            "Right on track" +
                (buyByLabel?.let { " for $it. Keep it up!" } ?: ". Keep it up!")
        GoalPace.BEHIND ->
            if (catchUpPerWeekFormatted != null) {
                "A little behind — bump it to $catchUpPerWeekFormatted/week to stay on time."
            } else {
                "A little behind — save a bit more each week to catch up."
            }
        GoalPace.OVERDUE ->
            if (catchUpPerWeekFormatted != null) {
                "Your date has passed. Save $catchUpPerWeekFormatted to finish, or pick a new date."
            } else {
                "Your date has passed — pick a new one to get a fresh plan."
            }
    }

    /**
     * A short, motivating label for the current milestone.
     */
    fun milestoneLabel(milestone: GoalMilestone): String = when (milestone) {
        GoalMilestone.STARTED -> "Just getting started"
        GoalMilestone.QUARTER -> "25% there — nice start!"
        GoalMilestone.HALF -> "Halfway there! 🚗"
        GoalMilestone.THREE_QUARTER -> "75% — almost home!"
        GoalMilestone.COMPLETE -> "Goal reached! 🎉"
    }

    /**
     * The milestone percentage as a whole number (25/50/75/100, 0 when started).
     */
    fun milestonePercent(milestone: GoalMilestone): Int = when (milestone) {
        GoalMilestone.STARTED -> 0
        GoalMilestone.QUARTER -> 25
        GoalMilestone.HALF -> 50
        GoalMilestone.THREE_QUARTER -> 75
        GoalMilestone.COMPLETE -> 100
    }
}
