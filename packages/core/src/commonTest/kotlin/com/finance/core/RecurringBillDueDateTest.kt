// SPDX-License-Identifier: BUSL-1.1

package com.finance.core

import com.finance.core.recurring.*
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.datetime.*
import kotlin.test.*

/**
 * Tests for recurring bills and due date handling (#1361).
 *
 * Verifies recurring rule creation (all frequencies), next due date
 * calculation, month-end edge cases, leap year handling, end date
 * boundaries, recurring rule linking, and bill reminder scheduling.
 */
@Suppress("LargeClass") // Test suite intentionally groups all recurring-bill scenarios for discoverability
class RecurringBillDueDateTest {

    @BeforeTest
    fun setup() {
        TestFixtures.reset()
    }

    private fun createRule(
        frequency: RecurrenceFrequency = RecurrenceFrequency.MONTHLY,
        interval: Int = 1,
        startDate: LocalDate = LocalDate(2024, 1, 1),
        endDate: LocalDate? = null,
        dayOfMonth: Int? = null,
        dayOfWeek: DayOfWeek? = null,
    ) = RecurrenceRule(
        id = TestFixtures.nextId(),
        frequency = frequency,
        interval = interval,
        startDate = startDate,
        endDate = endDate,
        dayOfMonth = dayOfMonth,
        dayOfWeek = dayOfWeek,
    )

    private fun createBillRule(
        rule: RecurrenceRule,
        merchant: String = "Netflix",
        amount: Cents = Cents(1599L),
        nextDueDate: LocalDate = rule.startDate,
    ) = RecurringTransactionRule(
        id = rule.id,
        ownerId = SyncId("owner-1"),
        householdId = SyncId("household-1"),
        merchant = merchant,
        amount = amount,
        currency = Currency.USD,
        accountId = SyncId("account-1"),
        recurrenceRule = rule,
        nextDueDate = nextDueDate,
        createdAt = TestFixtures.fixedInstant,
        updatedAt = TestFixtures.fixedInstant,
    )

    // ═══════════════════════════════════════════════════════════════════
    // Create Recurring Rules — All Frequencies
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun createDailyRule() {
        val rule = createRule(
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2024, 7, 1),
        )
        assertEquals(RecurrenceFrequency.DAILY, rule.frequency)
        assertEquals(1, rule.interval)
    }

    @Test
    fun createWeeklyRule() {
        val rule = createRule(
            frequency = RecurrenceFrequency.WEEKLY,
            dayOfWeek = DayOfWeek.MONDAY,
        )
        assertEquals(RecurrenceFrequency.WEEKLY, rule.frequency)
        assertEquals(DayOfWeek.MONDAY, rule.dayOfWeek)
    }

    @Test
    fun createBiweeklyRule() {
        val rule = createRule(frequency = RecurrenceFrequency.BIWEEKLY)
        assertEquals(RecurrenceFrequency.BIWEEKLY, rule.frequency)
    }

    @Test
    fun createMonthlyRule() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            dayOfMonth = 15,
        )
        assertEquals(RecurrenceFrequency.MONTHLY, rule.frequency)
        assertEquals(15, rule.dayOfMonth)
    }

    @Test
    fun createYearlyRule() {
        val rule = createRule(frequency = RecurrenceFrequency.YEARLY)
        assertEquals(RecurrenceFrequency.YEARLY, rule.frequency)
    }

    @Test
    fun createRuleWithIntervalGreaterThanOne() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            interval = 3, // every 3 months = quarterly
        )
        assertEquals(3, rule.interval)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Validation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun rejectZeroInterval() {
        assertFailsWith<IllegalArgumentException> {
            createRule(interval = 0)
        }
    }

    @Test
    fun rejectNegativeInterval() {
        assertFailsWith<IllegalArgumentException> {
            createRule(interval = -1)
        }
    }

    @Test
    fun rejectDayOfMonthOutOfRange() {
        assertFailsWith<IllegalArgumentException> {
            createRule(dayOfMonth = 32)
        }
        assertFailsWith<IllegalArgumentException> {
            createRule(dayOfMonth = 0)
        }
    }

    @Test
    fun rejectEndDateBeforeStartDate() {
        assertFailsWith<IllegalArgumentException> {
            createRule(
                startDate = LocalDate(2024, 6, 1),
                endDate = LocalDate(2024, 5, 1),
            )
        }
    }

    @Test
    fun rejectBlankMerchantOnBillRule() {
        assertFailsWith<IllegalArgumentException> {
            val rule = createRule()
            RecurringTransactionRule(
                id = rule.id,
                ownerId = SyncId("owner-1"),
                householdId = SyncId("household-1"),
                merchant = "",
                amount = Cents(1000L),
                currency = Currency.USD,
                accountId = SyncId("account-1"),
                recurrenceRule = rule,
                nextDueDate = rule.startDate,
                createdAt = TestFixtures.fixedInstant,
                updatedAt = TestFixtures.fixedInstant,
            )
        }
    }

    @Test
    fun rejectZeroBillAmount() {
        assertFailsWith<IllegalArgumentException> {
            val rule = createRule()
            RecurringTransactionRule(
                id = rule.id,
                ownerId = SyncId("owner-1"),
                householdId = SyncId("household-1"),
                merchant = "Test",
                amount = Cents.ZERO,
                currency = Currency.USD,
                accountId = SyncId("account-1"),
                recurrenceRule = rule,
                nextDueDate = rule.startDate,
                createdAt = TestFixtures.fixedInstant,
                updatedAt = TestFixtures.fixedInstant,
            )
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Next Due Date Calculation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun dailyNextOccurrence() {
        val rule = createRule(
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2024, 7, 1),
        )
        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 7, 1),
            to = LocalDate(2024, 7, 5),
        )
        assertEquals(5, dates.size)
        assertEquals(LocalDate(2024, 7, 1), dates.first())
        assertEquals(LocalDate(2024, 7, 5), dates.last())
    }

    @Test
    fun weeklyNextOccurrence() {
        val rule = createRule(
            frequency = RecurrenceFrequency.WEEKLY,
            startDate = LocalDate(2024, 7, 1), // Monday
        )
        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 7, 1),
            to = LocalDate(2024, 7, 31),
        )
        // July 1, 8, 15, 22, 29
        assertEquals(5, dates.size)
        assertEquals(7, dates[1].dayOfMonth - dates[0].dayOfMonth)
    }

    @Test
    fun monthlyNextOccurrence() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 1, 15),
            dayOfMonth = 15,
        )
        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 1, 15),
            to = LocalDate(2024, 6, 15),
        )
        assertEquals(6, dates.size)
        dates.forEach { assertEquals(15, it.dayOfMonth) }
    }

    @Test
    fun yearlyNextOccurrence() {
        val rule = createRule(
            frequency = RecurrenceFrequency.YEARLY,
            startDate = LocalDate(2020, 3, 15),
        )
        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2020, 3, 15),
            to = LocalDate(2024, 12, 31),
        )
        // 2020, 2021, 2022, 2023, 2024
        assertEquals(5, dates.size)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Month-End Edge Cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun monthlyDay31ClampsToFeb28() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2023, 1, 31),
            dayOfMonth = 31,
        )
        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2023, 1, 31),
            to = LocalDate(2023, 4, 30),
        )

        // Jan 31, Feb 28 (clamped), Mar 31, Apr 30 (clamped)
        assertEquals(4, dates.size)
        assertEquals(31, dates[0].dayOfMonth) // Jan 31
        assertEquals(28, dates[1].dayOfMonth) // Feb 28 (2023 not leap)
        assertEquals(31, dates[2].dayOfMonth) // Mar 31
        assertEquals(30, dates[3].dayOfMonth) // Apr 30
    }

    @Test
    fun monthlyDay31ClampsToFeb29InLeapYear() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 1, 31),
            dayOfMonth = 31,
        )
        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 1, 31),
            to = LocalDate(2024, 2, 29),
        )

        assertEquals(2, dates.size)
        assertEquals(31, dates[0].dayOfMonth) // Jan 31
        assertEquals(29, dates[1].dayOfMonth) // Feb 29 (2024 is leap)
    }

    @Test
    fun monthlyDay30ClampsToFeb28() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2023, 1, 30),
            dayOfMonth = 30,
        )
        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2023, 1, 30),
            to = LocalDate(2023, 3, 30),
        )

        assertEquals(3, dates.size)
        assertEquals(30, dates[0].dayOfMonth)
        assertEquals(28, dates[1].dayOfMonth) // Feb clamped
        assertEquals(30, dates[2].dayOfMonth)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Leap Year Handling
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun yearlyOnFeb29InLeapYear() {
        val rule = createRule(
            frequency = RecurrenceFrequency.YEARLY,
            startDate = LocalDate(2024, 2, 29),
        )
        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 2, 29),
            to = LocalDate(2029, 12, 31),
        )

        // 2024 (leap), then all subsequent years clamp to Feb 28
        // because advanceYearly uses current.dayOfMonth (28 after first clamp)
        assertTrue(dates.size >= 5)
        assertEquals(29, dates[0].dayOfMonth) // 2024 leap (start date)
        assertEquals(28, dates[1].dayOfMonth) // 2025 non-leap → clamp
        assertEquals(28, dates[2].dayOfMonth) // 2026 stays 28
        assertEquals(28, dates[3].dayOfMonth) // 2027 stays 28
        assertEquals(28, dates[4].dayOfMonth) // 2028 stays 28 (dayOfMonth not preserved)
    }

    @Test
    fun leapYearDetection() {
        // 2024 is a leap year (divisible by 4, not by 100)
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 1, 31),
            dayOfMonth = 31,
        )
        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 2, 1),
            to = LocalDate(2024, 2, 29),
        )
        assertEquals(1, dates.size)
        assertEquals(29, dates[0].dayOfMonth)
    }

    @Test
    fun centuryYearNotLeap() {
        // 1900 is not a leap year (divisible by 100 but not 400)
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(1900, 1, 31),
            dayOfMonth = 31,
        )
        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(1900, 2, 1),
            to = LocalDate(1900, 2, 28),
        )
        assertEquals(1, dates.size)
        assertEquals(28, dates[0].dayOfMonth)
    }

    @Test
    fun year2000IsLeap() {
        // 2000 is a leap year (divisible by 400)
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2000, 1, 31),
            dayOfMonth = 31,
        )
        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2000, 2, 1),
            to = LocalDate(2000, 2, 29),
        )
        assertEquals(1, dates.size)
        assertEquals(29, dates[0].dayOfMonth)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Rule with End Date
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun ruleWithEndDateStopsGenerating() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 1, 1),
            endDate = LocalDate(2024, 3, 31),
        )
        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 1, 1),
            to = LocalDate(2024, 12, 31),
        )
        // Only Jan, Feb, Mar
        assertEquals(3, dates.size)
        assertEquals(LocalDate(2024, 3, 1), dates.last())
    }

    @Test
    fun ruleEndDateOnExactOccurrence() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 1, 15),
            endDate = LocalDate(2024, 3, 15),
            dayOfMonth = 15,
        )
        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 1, 15),
            to = LocalDate(2024, 12, 31),
        )
        // Jan 15, Feb 15, Mar 15
        assertEquals(3, dates.size)
    }

    @Test
    fun ruleWithStartEqualsEndDateSingleOccurrence() {
        val rule = createRule(
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2024, 6, 15),
            endDate = LocalDate(2024, 6, 15),
        )
        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 6, 15),
            to = LocalDate(2024, 6, 15),
        )
        assertEquals(1, dates.size)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Rule without End Date (Indefinite)
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun indefiniteRuleGeneratesWithinWindow() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 1, 1),
            endDate = null,
        )
        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 1, 1),
            to = LocalDate(2024, 12, 31),
        )
        assertEquals(12, dates.size) // all 12 months
    }

    // ═══════════════════════════════════════════════════════════════════
    // recurringRuleId Linking
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun generatedTransactionLinksToRule() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 7, 1),
        )

        val template = TestFixtures.createExpense(
            amount = Cents(1599L),
        )

        val generated = RecurringTransactionEngine.createFromRecurring(
            template, rule, LocalDate(2024, 7, 1),
        )

        assertTrue(generated.isRecurring)
        assertEquals(rule.id, generated.recurringRuleId)
        assertEquals(TransactionStatus.PENDING, generated.status)
        assertEquals(LocalDate(2024, 7, 1), generated.date)
    }

    @Test
    fun generatedTransactionHasDeterministicId() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 7, 1),
        )

        val template = TestFixtures.createExpense()
        val date = LocalDate(2024, 7, 1)

        val generated1 = RecurringTransactionEngine.createFromRecurring(template, rule, date)
        val generated2 = RecurringTransactionEngine.createFromRecurring(template, rule, date)

        // Same rule + same date = same ID (idempotent)
        assertEquals(generated1.id, generated2.id)
    }

    @Test
    fun generatedTransactionPreservesTemplateFields() {
        val template = TestFixtures.createTransaction(
            accountId = SyncId("checking"),
            categoryId = SyncId("subscriptions"),
            payee = "Netflix",
            note = "Monthly streaming",
            amount = Cents(1599L),
        )

        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 7, 1),
        )

        val generated = RecurringTransactionEngine.createFromRecurring(
            template, rule, LocalDate(2024, 7, 1),
        )

        assertEquals(SyncId("checking"), generated.accountId)
        assertEquals(SyncId("subscriptions"), generated.categoryId)
        assertEquals("Netflix", generated.payee)
        assertEquals("Monthly streaming", generated.note)
        assertEquals(Cents(1599L), generated.amount)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Bill Reminder Scheduling
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun billReminderSchedulesNotification() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 7, 15),
        )
        val billRule = createBillRule(
            rule = rule,
            merchant = "Electric Company",
            amount = Cents(12000L),
            nextDueDate = LocalDate(2024, 7, 15),
        )
        val reminder = BillReminder(
            id = TestFixtures.nextId(),
            ruleId = rule.id,
            ownerId = SyncId("owner-1"),
            offsetDays = 3,
        )

        val notifications = BillReminderEngine.scheduleNotifications(
            rules = listOf(billRule),
            reminders = mapOf(rule.id to reminder),
            today = LocalDate(2024, 7, 1),
        )

        assertEquals(1, notifications.size)
        assertEquals(LocalDate(2024, 7, 12), notifications[0].notificationDate) // 3 days before
        assertEquals(LocalDate(2024, 7, 15), notifications[0].dueDate)
        assertEquals("Electric Company", notifications[0].merchant)
    }

    @Test
    fun billReminderOnDueDate() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 7, 15),
        )
        val billRule = createBillRule(rule = rule, nextDueDate = LocalDate(2024, 7, 15))
        val reminder = BillReminder(
            id = TestFixtures.nextId(),
            ruleId = rule.id,
            ownerId = SyncId("owner-1"),
            offsetDays = 0, // remind on due date
        )

        val notifications = BillReminderEngine.scheduleNotifications(
            rules = listOf(billRule),
            reminders = mapOf(rule.id to reminder),
            today = LocalDate(2024, 7, 15),
        )

        assertEquals(1, notifications.size)
        assertEquals(LocalDate(2024, 7, 15), notifications[0].notificationDate)
    }

    @Test
    fun disabledReminderNotScheduled() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 7, 15),
        )
        val billRule = createBillRule(rule = rule, nextDueDate = LocalDate(2024, 7, 15))
        val reminder = BillReminder(
            id = TestFixtures.nextId(),
            ruleId = rule.id,
            ownerId = SyncId("owner-1"),
            isEnabled = false,
        )

        val notifications = BillReminderEngine.scheduleNotifications(
            rules = listOf(billRule),
            reminders = mapOf(rule.id to reminder),
            today = LocalDate(2024, 7, 1),
        )

        assertTrue(notifications.isEmpty())
    }

    @Test
    fun unconfirmedRuleNotScheduled() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 7, 15),
        )
        val billRule = createBillRule(rule = rule, nextDueDate = LocalDate(2024, 7, 15))
            .copy(isConfirmed = false)
        val reminder = BillReminder(
            id = TestFixtures.nextId(),
            ruleId = rule.id,
            ownerId = SyncId("owner-1"),
        )

        val notifications = BillReminderEngine.scheduleNotifications(
            rules = listOf(billRule),
            reminders = mapOf(rule.id to reminder),
            today = LocalDate(2024, 7, 1),
        )

        assertTrue(notifications.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // Bill Calendar
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun monthlyCalendarShowsBills() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 1, 15),
            dayOfMonth = 15,
        )
        val billRule = createBillRule(
            rule = rule,
            merchant = "Internet",
            amount = Cents(6999L),
        )

        val calendar = BillReminderEngine.generateMonthlyCalendar(
            rules = listOf(billRule),
            year = 2024,
            month = 7,
            today = LocalDate(2024, 7, 1),
        )

        assertEquals(2024, calendar.year)
        assertEquals(7, calendar.month)
        assertEquals(1, calendar.billCount)
        assertEquals(Cents(6999L), calendar.totalDue)
    }

    @Test
    fun overdueBillDetected() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 7, 5),
            dayOfMonth = 5,
        )
        val billRule = createBillRule(rule = rule, merchant = "Phone Bill")

        val calendar = BillReminderEngine.generateMonthlyCalendar(
            rules = listOf(billRule),
            year = 2024,
            month = 7,
            today = LocalDate(2024, 7, 10), // past due date
        )

        val entry = calendar.days.first().bills.first()
        assertTrue(entry.isOverdue)
        assertFalse(entry.isPaid)
    }

    @Test
    fun paidBillNotOverdue() {
        val ruleId = TestFixtures.nextId()
        val rule = RecurrenceRule(
            id = ruleId,
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 7, 5),
            dayOfMonth = 5,
        )
        val billRule = createBillRule(rule = rule, merchant = "Phone Bill")

        val paidBills = setOf(Pair(ruleId, LocalDate(2024, 7, 5)))

        val calendar = BillReminderEngine.generateMonthlyCalendar(
            rules = listOf(billRule),
            year = 2024,
            month = 7,
            today = LocalDate(2024, 7, 10),
            paidBills = paidBills,
        )

        val entry = calendar.days.first().bills.first()
        assertTrue(entry.isPaid)
        assertFalse(entry.isOverdue)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Edge Cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun noOccurrencesWhenStartDateAfterWindow() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2025, 1, 1),
        )
        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 1, 1),
            to = LocalDate(2024, 12, 31),
        )
        assertTrue(dates.isEmpty())
    }

    @Test
    fun ruleWithLargeInterval() {
        val rule = createRule(
            frequency = RecurrenceFrequency.DAILY,
            interval = 7, // effectively weekly
            startDate = LocalDate(2024, 7, 1),
        )
        val dates = RecurringTransactionEngine.generateUpcoming(
            rule,
            from = LocalDate(2024, 7, 1),
            to = LocalDate(2024, 7, 31),
        )
        // July 1, 8, 15, 22, 29
        assertEquals(5, dates.size)
    }

    @Test
    fun reminderTimeValidation() {
        val time = ReminderTime(9, 30)
        assertEquals(9, time.hour)
        assertEquals(30, time.minute)
        assertEquals("09:30", time.toString())
    }

    @Test
    fun reminderTimeRejectsInvalidHour() {
        assertFailsWith<IllegalArgumentException> {
            ReminderTime(24, 0)
        }
    }

    @Test
    fun reminderTimeRejectsInvalidMinute() {
        assertFailsWith<IllegalArgumentException> {
            ReminderTime(12, 60)
        }
    }

    @Test
    fun billReminderRejectsNegativeOffsetDays() {
        assertFailsWith<IllegalArgumentException> {
            BillReminder(
                id = TestFixtures.nextId(),
                ruleId = TestFixtures.nextId(),
                ownerId = SyncId("owner-1"),
                offsetDays = -1,
            )
        }
    }

    @Test
    fun billAmountChangeDetection() {
        val ruleId = TestFixtures.nextId()
        val history = listOf(
            BillAmountRecord(LocalDate(2024, 5, 1), Cents(5000L)),
            BillAmountRecord(LocalDate(2024, 6, 1), Cents(5500L)),
        )

        val change = BillReminderEngine.detectAmountChange(
            ruleId, "Electric", history,
        )

        assertNotNull(change)
        assertEquals(Cents(5000L), change.previousAmount)
        assertEquals(Cents(5500L), change.currentAmount)
        assertEquals(Cents(500L), change.amountChange)
        assertTrue(change.isIncrease)
        assertFalse(change.isDecrease)
        assertEquals(10.0, change.changePercentage)
    }

    @Test
    fun billAmountNoChangeReturnsNull() {
        val history = listOf(
            BillAmountRecord(LocalDate(2024, 5, 1), Cents(5000L)),
            BillAmountRecord(LocalDate(2024, 6, 1), Cents(5000L)),
        )

        val change = BillReminderEngine.detectAmountChange(
            TestFixtures.nextId(), "Stable Bill", history,
        )
        assertNull(change)
    }

    @Test
    fun billAmountInsufficientHistory() {
        val history = listOf(
            BillAmountRecord(LocalDate(2024, 5, 1), Cents(5000L)),
        )
        val change = BillReminderEngine.detectAmountChange(
            TestFixtures.nextId(), "New Bill", history,
        )
        assertNull(change)
    }

    @Test
    fun generateFromAndToValidation() {
        val rule = createRule(
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2024, 1, 1),
        )
        assertFailsWith<IllegalArgumentException> {
            RecurringTransactionEngine.generateUpcoming(
                rule,
                from = LocalDate(2024, 7, 1),
                to = LocalDate(2024, 6, 1), // to before from
            )
        }
    }
}
