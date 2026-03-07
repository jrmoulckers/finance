package com.finance.core.insights

/**
 * Tracks consecutive-day streaks for gamification.
 *
 * @property currentDays Number of consecutive days the streak is currently active.
 * @property longestDays The longest streak ever recorded (always >= [currentDays]).
 * @property type The kind of streak being tracked.
 */
data class Streak(
    val currentDays: Int,
    val longestDays: Int,
    val type: StreakType,
) {
    init {
        require(currentDays >= 0) { "currentDays must be non-negative" }
        require(longestDays >= currentDays) { "longestDays must be >= currentDays" }
    }
}

/**
 * The type of streak tracked by the gamification engine.
 */
enum class StreakType {
    /** Consecutive days where all active budgets stayed under their limits. */
    UNDER_BUDGET,

    /** Consecutive days where the user logged at least one transaction. */
    DAILY_TRACKING,
}
