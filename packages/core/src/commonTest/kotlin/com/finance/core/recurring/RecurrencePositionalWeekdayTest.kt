// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.recurring

import com.finance.models.types.SyncId
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Tests for RRULE-style positional weekday (BYDAY) monthly recurrences (#3747). */
class RecurrencePositionalWeekdayTest {

    private fun rule(
        startDate: LocalDate,
        dayOfWeek: DayOfWeek,
        nthWeekday: Int,
        interval: Int = 1,
        endDate: LocalDate? = null,
        count: Int? = null,
    ) = RecurrenceRule(
        id = SyncId("pos"),
        frequency = RecurrenceFrequency.MONTHLY,
        interval = interval,
        startDate = startDate,
        endDate = endDate,
        dayOfWeek = dayOfWeek,
        nthWeekday = nthWeekday,
        count = count,
    )

    @Test
    fun secondTuesday_resolvesAcrossMonths() {
        val r = rule(LocalDate(2024, 1, 1), DayOfWeek.TUESDAY, 2)

        val dates = RecurringTransactionEngine.generateUpcoming(
            r, from = LocalDate(2024, 1, 1), to = LocalDate(2024, 4, 30),
        )

        assertEquals(
            listOf(
                LocalDate(2024, 1, 9),
                LocalDate(2024, 2, 13),
                LocalDate(2024, 3, 12),
                LocalDate(2024, 4, 9),
            ),
            dates,
        )
    }

    @Test
    fun lastFriday_resolvesAcrossMonthsIncludingLeapFebruary() {
        val r = rule(LocalDate(2024, 1, 1), DayOfWeek.FRIDAY, -1)

        val dates = RecurringTransactionEngine.generateUpcoming(
            r, from = LocalDate(2024, 1, 1), to = LocalDate(2024, 4, 30),
        )

        assertEquals(
            listOf(
                LocalDate(2024, 1, 26),
                LocalDate(2024, 2, 23), // Feb 2024 is a leap year, last Friday is the 23rd
                LocalDate(2024, 3, 29),
                LocalDate(2024, 4, 26),
            ),
            dates,
        )
    }

    @Test
    fun fifthTuesday_clampsToLastWhenMonthHasOnlyFour() {
        val r = rule(LocalDate(2024, 1, 1), DayOfWeek.TUESDAY, 5)

        // Jan 2024 has five Tuesdays (2,9,16,23,30); Feb has four (6,13,20,27) → clamp to 27.
        assertEquals(
            LocalDate(2024, 1, 30),
            RecurringTransactionEngine.nthWeekdayOfMonth(2024, 1, DayOfWeek.TUESDAY, 5),
        )
        assertEquals(
            LocalDate(2024, 2, 27),
            RecurringTransactionEngine.nthWeekdayOfMonth(2024, 2, DayOfWeek.TUESDAY, 5),
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            r, from = LocalDate(2024, 1, 1), to = LocalDate(2024, 2, 29),
        )
        assertEquals(listOf(LocalDate(2024, 1, 30), LocalDate(2024, 2, 27)), dates)
    }

    @Test
    fun firstOccurrenceAfterNthWeekdayAlreadyPassed_advancesToNextMonth() {
        // Start on Jan 20 but the 2nd Tuesday (Jan 9) already passed → first occurrence is Feb.
        val r = rule(LocalDate(2024, 1, 20), DayOfWeek.TUESDAY, 2)

        val next = RecurringTransactionEngine.nextOccurrenceOnOrAfter(r, LocalDate(2024, 1, 20))
        assertEquals(LocalDate(2024, 2, 13), next)
    }

    @Test
    fun interoperatesWithInterval() {
        // Every 2 months, 1st Monday.
        val r = rule(LocalDate(2024, 1, 1), DayOfWeek.MONDAY, 1, interval = 2)

        val dates = RecurringTransactionEngine.generateUpcoming(
            r, from = LocalDate(2024, 1, 1), to = LocalDate(2024, 6, 30),
        )
        assertEquals(
            listOf(
                LocalDate(2024, 1, 1), // Jan 1 2024 is a Monday, the 1st Monday
                LocalDate(2024, 3, 4),
                LocalDate(2024, 5, 6),
            ),
            dates,
        )
    }

    @Test
    fun interoperatesWithCount() {
        val r = rule(LocalDate(2024, 1, 1), DayOfWeek.WEDNESDAY, 3, count = 2)

        val dates = RecurringTransactionEngine.generateUpcoming(
            r, from = LocalDate(2024, 1, 1), to = LocalDate(2024, 12, 31),
        )
        assertEquals(2, dates.size)
        assertTrue(dates.all { it.dayOfWeek == DayOfWeek.WEDNESDAY })
    }

    @Test
    fun interoperatesWithEndDate() {
        val r = rule(
            LocalDate(2024, 1, 1), DayOfWeek.TUESDAY, 2,
            endDate = LocalDate(2024, 2, 20),
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            r, from = LocalDate(2024, 1, 1), to = LocalDate(2024, 12, 31),
        )
        assertEquals(listOf(LocalDate(2024, 1, 9), LocalDate(2024, 2, 13)), dates)
    }
}
