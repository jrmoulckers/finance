// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.recurring

import com.finance.core.TestFixtures
import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.assertFalse

/** Tests for bounded, paid-aware overdue reminder detection (#3735). */
class OverdueRemindersBoundedTest {

    private fun dailyRule(id: String, start: LocalDate) = RecurrenceRule(
        id = SyncId(id),
        frequency = RecurrenceFrequency.DAILY,
        startDate = start,
    )

    @Test
    fun longRunningDailyRule_isBoundedByDefaultLookbackAndCap() {
        val template = TestFixtures.createExpense()
        val rule = dailyRule("daily", LocalDate(2020, 1, 1)) // started years ago
        val today = LocalDate(2024, 6, 15)

        val reminders = RecurringTransactionEngine.getOverdueReminders(
            rules = listOf(rule to template),
            today = today,
        )

        // Without bounding this would materialize ~1600 occurrences; the cap keeps it small.
        assertEquals(RecurringTransactionEngine.DEFAULT_OVERDUE_MAX_PER_RULE, reminders.size)
        assertTrue(reminders.all { it.isOverdue })
        // Most-recent occurrences are kept; the newest is today.
        assertEquals(today, reminders.last().dueDate)
    }

    @Test
    fun customLookbackWindow_limitsHowFarBack() {
        val template = TestFixtures.createExpense()
        val rule = dailyRule("daily", LocalDate(2020, 1, 1))
        val today = LocalDate(2024, 6, 15)

        val reminders = RecurringTransactionEngine.getOverdueReminders(
            rules = listOf(rule to template),
            today = today,
            lookbackDays = 5,
            maxPerRule = 100,
        )

        // Window is [today-5, today] inclusive = 6 days.
        assertEquals(6, reminders.size)
        assertEquals(LocalDate(2024, 6, 10), reminders.first().dueDate)
        assertEquals(today, reminders.last().dueDate)
    }

    @Test
    fun paidOccurrences_areExcluded() {
        val template = TestFixtures.createExpense()
        val rule = dailyRule("daily", LocalDate(2024, 6, 10))
        val today = LocalDate(2024, 6, 15)
        val paid = setOf(
            SyncId("daily") to LocalDate(2024, 6, 11),
            SyncId("daily") to LocalDate(2024, 6, 13),
        )

        val reminders = RecurringTransactionEngine.getOverdueReminders(
            rules = listOf(rule to template),
            today = today,
            paidOccurrences = paid,
        )

        val dueDates = reminders.map { it.dueDate }
        assertFalse(LocalDate(2024, 6, 11) in dueDates)
        assertFalse(LocalDate(2024, 6, 13) in dueDates)
        assertEquals(4, reminders.size) // 10,12,14,15
    }

    @Test
    fun capKeepsMostRecentOccurrences() {
        val template = TestFixtures.createExpense()
        val rule = dailyRule("daily", LocalDate(2024, 6, 1))
        val today = LocalDate(2024, 6, 15)

        val reminders = RecurringTransactionEngine.getOverdueReminders(
            rules = listOf(rule to template),
            today = today,
            maxPerRule = 3,
        )

        assertEquals(3, reminders.size)
        assertEquals(
            listOf(LocalDate(2024, 6, 13), LocalDate(2024, 6, 14), LocalDate(2024, 6, 15)),
            reminders.map { it.dueDate },
        )
    }

    @Test
    fun invalidArguments_areRejected() {
        val template = TestFixtures.createExpense()
        val rule = dailyRule("daily", LocalDate(2024, 6, 1))
        val today = LocalDate(2024, 6, 15)

        assertFailsWithNegativeLookback {
            RecurringTransactionEngine.getOverdueReminders(
                rules = listOf(rule to template), today = today, lookbackDays = -1,
            )
        }
        assertFailsWithNonPositiveCap {
            RecurringTransactionEngine.getOverdueReminders(
                rules = listOf(rule to template), today = today, maxPerRule = 0,
            )
        }
    }

    private fun assertFailsWithNegativeLookback(block: () -> Unit) {
        try {
            block(); error("expected IllegalArgumentException")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("lookbackDays") == true)
        }
    }

    private fun assertFailsWithNonPositiveCap(block: () -> Unit) {
        try {
            block(); error("expected IllegalArgumentException")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message?.contains("maxPerRule") == true)
        }
    }
}
