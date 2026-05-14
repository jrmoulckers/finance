// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.streak

import kotlinx.datetime.Clock
import kotlinx.datetime.DatePeriod
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime

/**
 * Pure-function streak calculator — no Android dependencies.
 *
 * Computes the current logging streak from a set of dates on which
 * the user logged at least one transaction. A streak is a sequence
 * of consecutive calendar days ending on today (or yesterday, to be
 * forgiving of time-zone edge cases).
 *
 * Design principles (non-manipulative):
 * - A missed day resets the streak to 0 — no "freeze" mechanics.
 * - No loss-aversion language; the UI should celebrate presence, not punish absence.
 * - The streak count is informational only — it does not gate features or rewards.
 */
object StreakCalculator {

    /**
     * Computes the current consecutive-day logging streak.
     *
     * @param loggingDates A set of [LocalDate]s on which the user logged
     *   at least one transaction. Does not need to be sorted.
     * @param today The current date (injectable for testing).
     * @return The number of consecutive days ending at [today] (or yesterday)
     *   that appear in [loggingDates]. Returns 0 if today/yesterday are
     *   not in the set.
     */
    @Suppress("ReturnCount") // Multiple early returns improve readability
    fun currentStreak(
        loggingDates: Set<LocalDate>,
        today: LocalDate = Clock.System.now()
            .toLocalDateTime(TimeZone.currentSystemDefault()).date,
    ): Int {
        if (loggingDates.isEmpty()) return 0

        // Start counting from today; if today isn't logged, try yesterday
        // (forgiving: the user may not have logged yet today).
        val startDate = when {
            today in loggingDates -> today
            today.minus(1, DateTimeUnit.DAY) in loggingDates -> {
                today.minus(1, DateTimeUnit.DAY)
            }
            else -> return 0
        }

        var streak = 0
        var checkDate = startDate
        while (checkDate in loggingDates) {
            streak++
            checkDate = checkDate.minus(1, DateTimeUnit.DAY)
        }

        return streak
    }

    /**
     * Computes the longest-ever streak from the provided dates.
     *
     * @param loggingDates All dates on which the user has logged transactions.
     * @return The length of the longest consecutive-day sequence found.
     */
    fun longestStreak(loggingDates: Set<LocalDate>): Int {
        if (loggingDates.isEmpty()) return 0

        val sorted = loggingDates.sorted()
        var maxStreak = 1
        var current = 1

        for (i in 1 until sorted.size) {
            val prev = sorted[i - 1]
            val next = sorted[i]
            if (next == prev.plus(1, DateTimeUnit.DAY)) {
                // next == prev + 1 day
                current++
                if (current > maxStreak) maxStreak = current
            } else if (next != prev) {
                // Gap — reset (skip duplicates)
                current = 1
            }
        }

        return maxStreak
    }

    /**
     * Returns a brief, positive, non-manipulative message for the given streak.
     *
     * Rules:
     * - 0 days → encouraging but NOT guilt-tripping
     * - 1-2 days → gentle acknowledgement
     * - 3-6 days → warm encouragement
     * - 7+ days → celebration without pressure to continue
     *
     * NEVER uses phrases like "Don't break your streak!" or "You'll lose your progress!"
     */
    fun streakMessage(streakDays: Int): String = when {
        streakDays == 0 -> "Log a transaction to start tracking"
        streakDays == 1 -> "Nice — you logged today!"
        streakDays == 2 -> "Two days in a row, great start"
        streakDays in 3..6 -> "$streakDays days of logging — well done"
        streakDays in 7..13 -> "A whole week! You're building a great habit"
        streakDays in 14..29 -> "$streakDays days — impressive consistency"
        else -> "$streakDays days — remarkable dedication"
    }
}
