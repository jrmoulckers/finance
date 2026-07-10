// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.recurring

import com.finance.models.types.SyncId
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlinx.datetime.daysUntil
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Tests for weekly/biweekly first-occurrence alignment and forward-only snapping (#3706). */
class RecurrenceWeeklyAlignmentTest {

    private fun rule(
        frequency: RecurrenceFrequency,
        startDate: LocalDate,
        dayOfWeek: DayOfWeek?,
        interval: Int = 1,
    ) = RecurrenceRule(
        id = SyncId("w"),
        frequency = frequency,
        interval = interval,
        startDate = startDate,
        dayOfWeek = dayOfWeek,
    )

    @Test
    fun weekly_startOnDifferentWeekday_firstOccurrenceAlignedForward() {
        // Start Friday 2024-07-05, preferred Monday → first occurrence is Monday 2024-07-08.
        val r = rule(RecurrenceFrequency.WEEKLY, LocalDate(2024, 7, 5), DayOfWeek.MONDAY)

        val dates = RecurringTransactionEngine.generateUpcoming(
            r, from = LocalDate(2024, 7, 5), to = LocalDate(2024, 7, 31),
        )

        assertEquals(
            listOf(
                LocalDate(2024, 7, 8),
                LocalDate(2024, 7, 15),
                LocalDate(2024, 7, 22),
                LocalDate(2024, 7, 29),
            ),
            dates,
        )
        assertTrue(dates.all { it.dayOfWeek == DayOfWeek.MONDAY })
    }

    @Test
    fun weekly_backwardSnapRegression_neverGoesEarlierThanPrevious() {
        // Regression: start Fri + WEEKLY + preferred MON must NOT yield a 3-day first interval.
        val r = rule(RecurrenceFrequency.WEEKLY, LocalDate(2024, 7, 5), DayOfWeek.MONDAY)

        val dates = RecurringTransactionEngine.generateUpcoming(
            r, from = LocalDate(2024, 7, 5), to = LocalDate(2024, 8, 31),
        )

        // Every consecutive pair is exactly 7 days apart and strictly increasing.
        dates.zipWithNext().forEach { (a, b) ->
            assertEquals(7, a.daysUntil(b))
            assertTrue(b > a)
        }
    }

    @Test
    fun biweekly_spacingIsAlwaysFourteenDaysOnPreferredWeekday() {
        val r = rule(RecurrenceFrequency.BIWEEKLY, LocalDate(2024, 7, 3), DayOfWeek.MONDAY)

        val dates = RecurringTransactionEngine.generateUpcoming(
            r, from = LocalDate(2024, 7, 1), to = LocalDate(2024, 9, 30),
        )

        assertTrue(dates.isNotEmpty())
        assertTrue(dates.all { it.dayOfWeek == DayOfWeek.MONDAY })
        dates.zipWithNext().forEach { (a, b) -> assertEquals(14, a.daysUntil(b)) }
        assertEquals(LocalDate(2024, 7, 8), dates.first()) // first Monday on/after Jul 3
    }

    @Test
    fun weekly_withoutDayOfWeek_startsExactlyOnStartDate() {
        val r = rule(RecurrenceFrequency.WEEKLY, LocalDate(2024, 7, 3), dayOfWeek = null)

        val dates = RecurringTransactionEngine.generateUpcoming(
            r, from = LocalDate(2024, 7, 3), to = LocalDate(2024, 7, 24),
        )

        assertEquals(LocalDate(2024, 7, 3), dates.first())
        dates.zipWithNext().forEach { (a, b) -> assertEquals(7, a.daysUntil(b)) }
    }

    @Test
    fun nextOccurrenceOnOrAfter_alignsToPreferredWeekday() {
        val r = rule(RecurrenceFrequency.WEEKLY, LocalDate(2024, 7, 5), DayOfWeek.MONDAY)

        val next = RecurringTransactionEngine.nextOccurrenceOnOrAfter(r, LocalDate(2024, 7, 5))
        assertEquals(LocalDate(2024, 7, 8), next)
        assertEquals(DayOfWeek.MONDAY, next?.dayOfWeek)
    }
}
