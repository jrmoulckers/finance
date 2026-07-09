// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.recurring

import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Tests for recurrence occurrence-generation correctness and rule-lifecycle controls:
 * month-end/leap-year anchor drift, RRULE-style COUNT, skipDates, isPaused, and the
 * single-shot [RecurringTransactionEngine.nextOccurrenceOnOrAfter] accessor.
 */
class RecurrenceRuleControlsTest {

    private fun rule(
        id: SyncId = SyncId("rule-1"),
        frequency: RecurrenceFrequency = RecurrenceFrequency.MONTHLY,
        interval: Int = 1,
        startDate: LocalDate = LocalDate(2024, 1, 1),
        endDate: LocalDate? = null,
        dayOfMonth: Int? = null,
        count: Int? = null,
        skipDates: Set<LocalDate> = emptySet(),
        isPaused: Boolean = false,
    ): RecurrenceRule = RecurrenceRule(
        id = id,
        frequency = frequency,
        interval = interval,
        startDate = startDate,
        endDate = endDate,
        dayOfMonth = dayOfMonth,
        count = count,
        skipDates = skipDates,
        isPaused = isPaused,
    )

    // ═══════════════════════════════════════════════════════════════════
    // Month-end / leap-year anchor drift (#3699)
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun monthly_monthEndAnchor_doesNotDrift_whenDayOfMonthNull() {
        // Jan 31 anchor with NO explicit dayOfMonth: the day must be preserved across
        // short months rather than collapsing to Feb 28 permanently.
        val r = rule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 1, 31),
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            r,
            from = LocalDate(2024, 1, 31),
            to = LocalDate(2024, 5, 31),
        )

        assertEquals(
            listOf(
                LocalDate(2024, 1, 31),
                LocalDate(2024, 2, 29), // leap-year clamp
                LocalDate(2024, 3, 31), // restored, not drifted to Mar 28
                LocalDate(2024, 4, 30), // clamp
                LocalDate(2024, 5, 31), // restored
            ),
            dates,
        )
    }

    @Test
    fun monthly_day30Anchor_restoredAfterFebruary() {
        val r = rule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2023, 1, 30),
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            r,
            from = LocalDate(2023, 1, 30),
            to = LocalDate(2023, 3, 30),
        )

        assertEquals(
            listOf(
                LocalDate(2023, 1, 30),
                LocalDate(2023, 2, 28), // non-leap clamp
                LocalDate(2023, 3, 30), // restored to the 30th
            ),
            dates,
        )
    }

    @Test
    fun yearly_feb29Anchor_restoredOnLeapYear_whenDayOfMonthNull() {
        val r = rule(
            frequency = RecurrenceFrequency.YEARLY,
            startDate = LocalDate(2024, 2, 29),
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            r,
            from = LocalDate(2024, 2, 29),
            to = LocalDate(2028, 3, 1),
        )

        assertEquals(
            listOf(
                LocalDate(2024, 2, 29),
                LocalDate(2025, 2, 28), // non-leap clamp
                LocalDate(2026, 2, 28),
                LocalDate(2027, 2, 28),
                LocalDate(2028, 2, 29), // restored on the next leap year
            ),
            dates,
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // COUNT end condition (#3719)
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun count_limitsTotalOccurrences() {
        val r = rule(
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2024, 1, 1),
            count = 3,
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            r,
            from = LocalDate(2024, 1, 1),
            to = LocalDate(2024, 1, 31),
        )

        assertEquals(
            listOf(
                LocalDate(2024, 1, 1),
                LocalDate(2024, 1, 2),
                LocalDate(2024, 1, 3),
            ),
            dates,
        )
    }

    @Test
    fun count_countsSlotsFromStartDate_notFromWindow() {
        // Two occurrences fall before the window; count=3 means only one remains visible.
        val r = rule(
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2024, 1, 1),
            count = 3,
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            r,
            from = LocalDate(2024, 1, 3),
            to = LocalDate(2024, 1, 31),
        )

        assertEquals(listOf(LocalDate(2024, 1, 3)), dates)
    }

    @Test
    fun count_andEndDate_earliestLimitWins() {
        val r = rule(
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2024, 1, 1),
            endDate = LocalDate(2024, 1, 2), // endDate stops first (2 occurrences)
            count = 5,
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            r,
            from = LocalDate(2024, 1, 1),
            to = LocalDate(2024, 1, 31),
        )

        assertEquals(
            listOf(LocalDate(2024, 1, 1), LocalDate(2024, 1, 2)),
            dates,
        )
    }

    @Test
    fun count_zeroOrNegative_isRejected() {
        assertFailsWith<IllegalArgumentException> {
            rule(count = 0)
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // skipDates (#3725)
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun skipDates_omitsSkippedOccurrences_withoutShiftingCadence() {
        val r = rule(
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2024, 1, 1),
            skipDates = setOf(LocalDate(2024, 1, 2), LocalDate(2024, 1, 4)),
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            r,
            from = LocalDate(2024, 1, 1),
            to = LocalDate(2024, 1, 5),
        )

        assertEquals(
            listOf(
                LocalDate(2024, 1, 1),
                LocalDate(2024, 1, 3),
                LocalDate(2024, 1, 5),
            ),
            dates,
        )
    }

    @Test
    fun skipDates_stillConsumeCountSlots() {
        // count=3 slots: Jan1 (skipped), Jan2, Jan3 → only Jan2, Jan3 emitted.
        val r = rule(
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2024, 1, 1),
            count = 3,
            skipDates = setOf(LocalDate(2024, 1, 1)),
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            r,
            from = LocalDate(2024, 1, 1),
            to = LocalDate(2024, 1, 31),
        )

        assertEquals(
            listOf(LocalDate(2024, 1, 2), LocalDate(2024, 1, 3)),
            dates,
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // isPaused (#3725)
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun paused_generatesNothing() {
        val r = rule(
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2024, 1, 1),
            isPaused = true,
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            r,
            from = LocalDate(2024, 1, 1),
            to = LocalDate(2024, 1, 31),
        )

        assertTrue(dates.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // nextOccurrenceOnOrAfter (#3732)
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun nextOccurrence_returnsStartWhenFromBeforeStart() {
        val r = rule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 6, 15),
        )

        assertEquals(
            LocalDate(2024, 6, 15),
            RecurringTransactionEngine.nextOccurrenceOnOrAfter(r, LocalDate(2024, 1, 1)),
        )
    }

    @Test
    fun nextOccurrence_returnsExactMatchOnBoundary() {
        val r = rule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 1, 10),
        )

        assertEquals(
            LocalDate(2024, 3, 10),
            RecurringTransactionEngine.nextOccurrenceOnOrAfter(r, LocalDate(2024, 3, 10)),
        )
    }

    @Test
    fun nextOccurrence_advancesPastMidScheduleDate() {
        val r = rule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 1, 10),
        )

        assertEquals(
            LocalDate(2024, 4, 10),
            RecurringTransactionEngine.nextOccurrenceOnOrAfter(r, LocalDate(2024, 3, 20)),
        )
    }

    @Test
    fun nextOccurrence_skipsSkippedDate() {
        val r = rule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 1, 10),
            skipDates = setOf(LocalDate(2024, 3, 10)),
        )

        assertEquals(
            LocalDate(2024, 4, 10),
            RecurringTransactionEngine.nextOccurrenceOnOrAfter(r, LocalDate(2024, 3, 1)),
        )
    }

    @Test
    fun nextOccurrence_nullAfterEndDate() {
        val r = rule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 1, 10),
            endDate = LocalDate(2024, 3, 10),
        )

        assertNull(
            RecurringTransactionEngine.nextOccurrenceOnOrAfter(r, LocalDate(2024, 4, 1)),
        )
    }

    @Test
    fun nextOccurrence_nullAfterCountExhausted() {
        val r = rule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 1, 10),
            count = 2, // Jan 10, Feb 10 only
        )

        assertNull(
            RecurringTransactionEngine.nextOccurrenceOnOrAfter(r, LocalDate(2024, 3, 1)),
        )
        assertEquals(
            LocalDate(2024, 2, 10),
            RecurringTransactionEngine.nextOccurrenceOnOrAfter(r, LocalDate(2024, 2, 1)),
        )
    }

    @Test
    fun nextOccurrence_nullWhenPaused() {
        val r = rule(
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2024, 1, 1),
            isPaused = true,
        )

        assertNull(
            RecurringTransactionEngine.nextOccurrenceOnOrAfter(r, LocalDate(2024, 1, 1)),
        )
    }

    @Test
    fun nextOccurrence_monthEndAnchorPreserved() {
        val r = rule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 1, 31),
        )

        // The occurrence in March must be the 31st, proving no drift via the single-shot path.
        assertEquals(
            LocalDate(2024, 3, 31),
            RecurringTransactionEngine.nextOccurrenceOnOrAfter(r, LocalDate(2024, 3, 1)),
        )
    }
}
