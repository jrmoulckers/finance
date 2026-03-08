// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.recurring

import com.finance.core.TestFixtures
import com.finance.models.TransactionStatus
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlin.test.*

class RecurringTransactionEngineTest {

    @BeforeTest
    fun setup() {
        TestFixtures.reset()
    }

    // ═══════════════════════════════════════════════════════════════════
    // generateUpcoming() — DAILY
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun daily_generatesEveryDay() {
        val rule = createRule(
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2024, 7, 1),
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 7, 1),
            to = LocalDate(2024, 7, 5),
        )

        assertEquals(
            listOf(
                LocalDate(2024, 7, 1),
                LocalDate(2024, 7, 2),
                LocalDate(2024, 7, 3),
                LocalDate(2024, 7, 4),
                LocalDate(2024, 7, 5),
            ),
            dates,
        )
    }

    @Test
    fun daily_withInterval_skipsCorrectly() {
        val rule = createRule(
            frequency = RecurrenceFrequency.DAILY,
            interval = 3,
            startDate = LocalDate(2024, 7, 1),
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 7, 1),
            to = LocalDate(2024, 7, 10),
        )

        assertEquals(
            listOf(
                LocalDate(2024, 7, 1),
                LocalDate(2024, 7, 4),
                LocalDate(2024, 7, 7),
                LocalDate(2024, 7, 10),
            ),
            dates,
        )
    }

    @Test
    fun daily_fromAfterStart_excludesEarlierDates() {
        val rule = createRule(
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2024, 7, 1),
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 7, 3),
            to = LocalDate(2024, 7, 5),
        )

        assertEquals(
            listOf(
                LocalDate(2024, 7, 3),
                LocalDate(2024, 7, 4),
                LocalDate(2024, 7, 5),
            ),
            dates,
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // generateUpcoming() — WEEKLY
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun weekly_generatesEveryWeek() {
        // 2024-07-01 is a Monday
        val rule = createRule(
            frequency = RecurrenceFrequency.WEEKLY,
            startDate = LocalDate(2024, 7, 1),
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 7, 1),
            to = LocalDate(2024, 7, 31),
        )

        assertEquals(
            listOf(
                LocalDate(2024, 7, 1),
                LocalDate(2024, 7, 8),
                LocalDate(2024, 7, 15),
                LocalDate(2024, 7, 22),
                LocalDate(2024, 7, 29),
            ),
            dates,
        )
    }

    @Test
    fun weekly_withDayOfWeek_snapsToFriday() {
        val rule = createRule(
            frequency = RecurrenceFrequency.WEEKLY,
            startDate = LocalDate(2024, 7, 5), // Friday
            dayOfWeek = DayOfWeek.FRIDAY,
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 7, 5),
            to = LocalDate(2024, 7, 26),
        )

        assertEquals(
            listOf(
                LocalDate(2024, 7, 5),
                LocalDate(2024, 7, 12),
                LocalDate(2024, 7, 19),
                LocalDate(2024, 7, 26),
            ),
            dates,
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // generateUpcoming() — BIWEEKLY
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun biweekly_generatesEveryTwoWeeks() {
        val rule = createRule(
            frequency = RecurrenceFrequency.BIWEEKLY,
            startDate = LocalDate(2024, 7, 1),
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 7, 1),
            to = LocalDate(2024, 8, 31),
        )

        assertEquals(
            listOf(
                LocalDate(2024, 7, 1),
                LocalDate(2024, 7, 15),
                LocalDate(2024, 7, 29),
                LocalDate(2024, 8, 12),
                LocalDate(2024, 8, 26),
            ),
            dates,
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // generateUpcoming() — MONTHLY
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun monthly_generatesEveryMonth() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 1, 15),
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 1, 15),
            to = LocalDate(2024, 6, 15),
        )

        assertEquals(
            listOf(
                LocalDate(2024, 1, 15),
                LocalDate(2024, 2, 15),
                LocalDate(2024, 3, 15),
                LocalDate(2024, 4, 15),
                LocalDate(2024, 5, 15),
                LocalDate(2024, 6, 15),
            ),
            dates,
        )
    }

    @Test
    fun monthly_dayOfMonth31_clampedToShorterMonths() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 1, 31),
            dayOfMonth = 31,
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 1, 31),
            to = LocalDate(2024, 4, 30),
        )

        assertEquals(
            listOf(
                LocalDate(2024, 1, 31),
                LocalDate(2024, 2, 29), // Leap year 2024
                LocalDate(2024, 3, 31),
                LocalDate(2024, 4, 30), // April has 30 days
            ),
            dates,
        )
    }

    @Test
    fun monthly_dayOfMonth31_nonLeapYear() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2023, 1, 31),
            dayOfMonth = 31,
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2023, 1, 31),
            to = LocalDate(2023, 3, 31),
        )

        assertEquals(
            listOf(
                LocalDate(2023, 1, 31),
                LocalDate(2023, 2, 28), // Non-leap year
                LocalDate(2023, 3, 31),
            ),
            dates,
        )
    }

    @Test
    fun monthly_withInterval_everyTwoMonths() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            interval = 2,
            startDate = LocalDate(2024, 1, 10),
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 1, 10),
            to = LocalDate(2024, 7, 10),
        )

        assertEquals(
            listOf(
                LocalDate(2024, 1, 10),
                LocalDate(2024, 3, 10),
                LocalDate(2024, 5, 10),
                LocalDate(2024, 7, 10),
            ),
            dates,
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // generateUpcoming() — YEARLY
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun yearly_generatesEveryYear() {
        val rule = createRule(
            frequency = RecurrenceFrequency.YEARLY,
            startDate = LocalDate(2020, 3, 15),
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2020, 3, 15),
            to = LocalDate(2024, 3, 15),
        )

        assertEquals(
            listOf(
                LocalDate(2020, 3, 15),
                LocalDate(2021, 3, 15),
                LocalDate(2022, 3, 15),
                LocalDate(2023, 3, 15),
                LocalDate(2024, 3, 15),
            ),
            dates,
        )
    }

    @Test
    fun yearly_feb29_clampedInNonLeapYear() {
        val rule = createRule(
            frequency = RecurrenceFrequency.YEARLY,
            startDate = LocalDate(2024, 2, 29), // Leap year start
            dayOfMonth = 29,
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 2, 29),
            to = LocalDate(2027, 3, 1),
        )

        assertEquals(
            listOf(
                LocalDate(2024, 2, 29),
                LocalDate(2025, 2, 28), // Non-leap
                LocalDate(2026, 2, 28), // Non-leap
                LocalDate(2027, 2, 28), // Non-leap
            ),
            dates,
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // generateUpcoming() — endDate boundary
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun endDate_truncatesOccurrences() {
        val rule = createRule(
            frequency = RecurrenceFrequency.WEEKLY,
            startDate = LocalDate(2024, 7, 1),
            endDate = LocalDate(2024, 7, 15),
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 7, 1),
            to = LocalDate(2024, 8, 31),
        )

        assertEquals(
            listOf(
                LocalDate(2024, 7, 1),
                LocalDate(2024, 7, 8),
                LocalDate(2024, 7, 15),
            ),
            dates,
        )
    }

    @Test
    fun noOccurrences_whenStartAfterTo() {
        val rule = createRule(
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2025, 1, 1),
        )

        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 1, 1),
            to = LocalDate(2024, 12, 31),
        )

        assertTrue(dates.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // createFromRecurring()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun createFromRecurring_setsFieldsCorrectly() {
        val template = TestFixtures.createExpense(
            amount = Cents(9999),
            date = LocalDate(2024, 1, 1),
        )
        val rule = createRule(
            id = SyncId("rule-42"),
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 1, 1),
        )

        val transaction = RecurringTransactionEngine.createFromRecurring(
            template, rule, LocalDate(2024, 3, 1),
        )

        assertEquals(SyncId("rec-rule-42-2024-03-01"), transaction.id)
        assertEquals(LocalDate(2024, 3, 1), transaction.date)
        assertEquals(TransactionStatus.PENDING, transaction.status)
        assertTrue(transaction.isRecurring)
        assertEquals(rule.id, transaction.recurringRuleId)
        // Template fields preserved
        assertEquals(template.amount, transaction.amount)
        assertEquals(template.type, transaction.type)
        assertEquals(template.accountId, transaction.accountId)
        assertEquals(template.categoryId, transaction.categoryId)
        assertEquals(template.currency, transaction.currency)
    }

    @Test
    fun createFromRecurring_idempotentForSameRuleAndDate() {
        val template = TestFixtures.createExpense()
        val rule = createRule(
            id = SyncId("rule-abc"),
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2024, 1, 1),
        )
        val date = LocalDate(2024, 5, 15)

        val first = RecurringTransactionEngine.createFromRecurring(template, rule, date)
        val second = RecurringTransactionEngine.createFromRecurring(template, rule, date)

        assertEquals(first.id, second.id, "Same rule + date must produce same ID")
    }

    // ═══════════════════════════════════════════════════════════════════
    // getOverdueReminders()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun overdue_detectsPastDueDates() {
        val template = TestFixtures.createExpense(
            amount = Cents(15000), // $150 rent
        )
        val rule = createRule(
            id = SyncId("rent-rule"),
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 1, 1),
            dayOfMonth = 1,
        )

        val today = LocalDate(2024, 3, 15)
        val reminders = RecurringTransactionEngine.getOverdueReminders(
            rules = listOf(rule to template),
            today = today,
        )

        // Jan 1, Feb 1, Mar 1 are all ≤ today
        assertEquals(3, reminders.size)
        assertTrue(reminders.all { it.isOverdue })
        assertEquals(LocalDate(2024, 1, 1), reminders[0].dueDate)
        assertEquals(LocalDate(2024, 2, 1), reminders[1].dueDate)
        assertEquals(LocalDate(2024, 3, 1), reminders[2].dueDate)
        assertTrue(reminders.all { it.ruleId == SyncId("rent-rule") })
    }

    @Test
    fun overdue_emptyWhenAllFuture() {
        val template = TestFixtures.createExpense()
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2025, 6, 1),
        )

        val reminders = RecurringTransactionEngine.getOverdueReminders(
            rules = listOf(rule to template),
            today = LocalDate(2024, 12, 31),
        )

        assertTrue(reminders.isEmpty())
    }

    @Test
    fun overdue_daysBefore_calculatesCorrectly() {
        val template = TestFixtures.createExpense()
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
            dayOfMonth = 1,
        )

        val today = LocalDate(2024, 6, 4) // 3 days after due
        val reminders = RecurringTransactionEngine.getOverdueReminders(
            rules = listOf(rule to template),
            today = today,
        )

        assertEquals(1, reminders.size)
        assertEquals(3, reminders[0].daysBefore) // 3 days overdue
    }

    @Test
    fun overdue_multipleRules_sortedByDueDate() {
        val rentTemplate = TestFixtures.createExpense(amount = Cents(150000))
        val rentRule = createRule(
            id = SyncId("rent"),
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 3, 1),
        )

        val insuranceTemplate = TestFixtures.createExpense(amount = Cents(50000))
        val insuranceRule = createRule(
            id = SyncId("insurance"),
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 2, 15),
        )

        val today = LocalDate(2024, 3, 20)
        val reminders = RecurringTransactionEngine.getOverdueReminders(
            rules = listOf(rentRule to rentTemplate, insuranceRule to insuranceTemplate),
            today = today,
        )

        // Expect: Feb 15 (insurance), Mar 1 (rent), Mar 15 (insurance) — sorted by dueDate
        assertEquals(3, reminders.size)
        assertEquals(LocalDate(2024, 2, 15), reminders[0].dueDate)
        assertEquals(SyncId("insurance"), reminders[0].ruleId)
        assertEquals(LocalDate(2024, 3, 1), reminders[1].dueDate)
        assertEquals(SyncId("rent"), reminders[1].ruleId)
        assertEquals(LocalDate(2024, 3, 15), reminders[2].dueDate)
        assertEquals(SyncId("insurance"), reminders[2].ruleId)
    }

    // ═══════════════════════════════════════════════════════════════════
    // RecurrenceRule — validation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun rule_rejectsZeroInterval() {
        assertFailsWith<IllegalArgumentException> {
            createRule(interval = 0)
        }
    }

    @Test
    fun rule_rejectsNegativeInterval() {
        assertFailsWith<IllegalArgumentException> {
            createRule(interval = -1)
        }
    }

    @Test
    fun rule_rejectsInvalidDayOfMonth() {
        assertFailsWith<IllegalArgumentException> {
            createRule(dayOfMonth = 0)
        }
        assertFailsWith<IllegalArgumentException> {
            createRule(dayOfMonth = 32)
        }
    }

    @Test
    fun rule_rejectsEndDateBeforeStart() {
        assertFailsWith<IllegalArgumentException> {
            createRule(
                startDate = LocalDate(2024, 6, 15),
                endDate = LocalDate(2024, 6, 1),
            )
        }
    }

    @Test
    fun generateUpcoming_rejectsFromAfterTo() {
        val rule = createRule()
        assertFailsWith<IllegalArgumentException> {
            RecurringTransactionEngine.generateUpcoming(
                rule,
                from = LocalDate(2025, 1, 1),
                to = LocalDate(2024, 1, 1),
            )
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════════

    private fun createRule(
        id: SyncId = TestFixtures.nextId(),
        frequency: RecurrenceFrequency = RecurrenceFrequency.MONTHLY,
        interval: Int = 1,
        startDate: LocalDate = LocalDate(2024, 1, 1),
        endDate: LocalDate? = null,
        dayOfMonth: Int? = null,
        dayOfWeek: DayOfWeek? = null,
    ): RecurrenceRule = RecurrenceRule(
        id = id,
        frequency = frequency,
        interval = interval,
        startDate = startDate,
        endDate = endDate,
        dayOfMonth = dayOfMonth,
        dayOfWeek = dayOfWeek,
    )
}
