// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.subscription

import com.finance.core.TestFixtures
import com.finance.core.recurring.BillAmountChange
import com.finance.core.recurring.BillAmountRecord
import com.finance.core.recurring.BillCalendarEntry
import com.finance.core.recurring.BillCalendarMonth
import com.finance.core.recurring.BillReminderEngine
import com.finance.core.recurring.BillReminder
import com.finance.core.recurring.RecurrenceFrequency
import com.finance.core.recurring.RecurrenceRule
import com.finance.core.recurring.RecurringTransactionRule
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.*
import kotlin.test.*

/**
 * Sprint 2 verification tests for #1370 — Subscription Detection & Bill Calendar.
 *
 * Covers:
 * - Subscription detection from recurring similar transactions
 * - Bill calendar generation for upcoming bills
 * - Notification timing calculation (days before due)
 * - Subscription cost summary (monthly/yearly totals)
 */
class SubscriptionBillCalendarVerificationTest {

    @BeforeTest
    fun setUp() {
        TestFixtures.reset()
    }

    // ═══════════════════════════════════════════════════════════════════
    // Subscription detection from recurring transactions
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun detect_monthlySubscription_identifiedCorrectly() {
        val transactions = (0..5).map { month ->
            TestFixtures.createExpense(
                amount = Cents(1599),
                date = LocalDate(2024, 1 + month, 15),
            ).copy(payee = "Netflix Premium")
        }

        val subscriptions = SubscriptionDetector.detect(transactions)
        assertEquals(1, subscriptions.size)
        assertEquals(SubscriptionFrequency.MONTHLY, subscriptions.first().frequency)
    }

    @Test
    fun detect_weeklySubscription_identifiedCorrectly() {
        val transactions = (0..7).map { week ->
            TestFixtures.createExpense(
                amount = Cents(500),
                date = LocalDate(2024, 1, 1).plus(week * 7, DateTimeUnit.DAY),
            ).copy(payee = "Weekly Delivery")
        }

        val subscriptions = SubscriptionDetector.detect(transactions)
        assertEquals(1, subscriptions.size)
        assertEquals(SubscriptionFrequency.WEEKLY, subscriptions.first().frequency)
    }

    @Test
    fun detect_yearlySubscription_identifiedCorrectly() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(11999), date = LocalDate(2022, 9, 1))
                .copy(payee = "Amazon Prime"),
            TestFixtures.createExpense(amount = Cents(11999), date = LocalDate(2023, 9, 1))
                .copy(payee = "Amazon Prime"),
        )

        val subscriptions = SubscriptionDetector.detect(transactions)
        assertEquals(1, subscriptions.size)
        assertEquals(SubscriptionFrequency.YEARLY, subscriptions.first().frequency)
    }

    @Test
    fun detect_singleTransaction_notDetectedAsSubscription() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(5000), date = LocalDate(2024, 6, 1))
                .copy(payee = "One-time Purchase"),
        )

        val subscriptions = SubscriptionDetector.detect(transactions)
        assertTrue(subscriptions.isEmpty())
    }

    @Test
    fun detect_irregularAmounts_notDetected() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 1, 15)).copy(payee = "Variable"),
            TestFixtures.createExpense(amount = Cents(8000), date = LocalDate(2024, 2, 15)).copy(payee = "Variable"),
            TestFixtures.createExpense(amount = Cents(3000), date = LocalDate(2024, 3, 15)).copy(payee = "Variable"),
        )

        val subscriptions = SubscriptionDetector.detect(transactions)
        assertTrue(subscriptions.isEmpty(), "Wildly varying amounts not detected as subscription")
    }

    @Test
    fun detect_deletedTransactions_ignored() {
        val transactions = (0..5).map { month ->
            TestFixtures.createExpense(
                amount = Cents(999),
                date = LocalDate(2024, 1 + month, 1),
                deletedAt = TestFixtures.fixedInstant,
            ).copy(payee = "Deleted Sub")
        }

        assertTrue(SubscriptionDetector.detect(transactions).isEmpty())
    }

    @Test
    fun detect_nullPayee_ignored() {
        val transactions = (0..5).map { month ->
            TestFixtures.createExpense(
                amount = Cents(999),
                date = LocalDate(2024, 1 + month, 1),
            ) // payee is null by default
        }

        assertTrue(SubscriptionDetector.detect(transactions).isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // Subscription cost summary
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun monthlyCost_sumsAllSubscriptions() {
        val transactions = buildList {
            (0..5).forEach { month ->
                add(TestFixtures.createExpense(amount = Cents(1500), date = LocalDate(2024, 1 + month, 1)).copy(payee = "Service A"))
            }
            (0..5).forEach { month ->
                add(TestFixtures.createExpense(amount = Cents(3000), date = LocalDate(2024, 1 + month, 15)).copy(payee = "Service B"))
            }
        }

        val subscriptions = SubscriptionDetector.detect(transactions)
        val monthly = SubscriptionDetector.estimateMonthlyCost(subscriptions)

        assertEquals(Cents(4500), monthly, "Monthly total = $15 + $30 = $45")
    }

    @Test
    fun annualCost_calculatesFromMonthly() {
        val transactions = buildList {
            (0..5).forEach { month ->
                add(TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 1 + month, 1)).copy(payee = "Sub"))
            }
        }

        val subscriptions = SubscriptionDetector.detect(transactions)
        val annual = SubscriptionDetector.estimateAnnualCost(subscriptions)

        assertEquals(Cents(12000), annual, "Annual = $10/mo × 12 = $120")
    }

    @Test
    fun toMonthlyCost_weeklyToMonthly_conversion() {
        val weeklyAmount = Cents(1000) // $10/week
        val monthly = SubscriptionDetector.toMonthlyCost(weeklyAmount, SubscriptionFrequency.WEEKLY)

        // $10 × 52 / 12 = $43.33
        assertEquals(Cents(1000 * 52 / 12), monthly)
    }

    @Test
    fun toMonthlyCost_yearlyToMonthly_conversion() {
        val yearlyAmount = Cents(12000) // $120/year
        val monthly = SubscriptionDetector.toMonthlyCost(yearlyAmount, SubscriptionFrequency.YEARLY)

        assertEquals(Cents(1000), monthly, "$120/year ÷ 12 = $10/month")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Bill calendar generation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun billCalendar_generatesForMonth() {
        val rule = createTestRule(
            merchant = "Electric Company",
            amount = Cents(15000),
            frequency = RecurrenceFrequency.MONTHLY,
            dayOfMonth = 15,
            startDate = LocalDate(2024, 1, 15),
        )

        val calendar = BillReminderEngine.generateMonthlyCalendar(
            rules = listOf(rule),
            year = 2024,
            month = 6,
            today = LocalDate(2024, 6, 1),
        )

        assertEquals(2024, calendar.year)
        assertEquals(6, calendar.month)
        assertEquals(1, calendar.billCount)
        assertEquals(Cents(15000), calendar.totalDue)
    }

    @Test
    fun billCalendar_multipleBills_sameDay() {
        val rules = listOf(
            createTestRule(merchant = "Electric", amount = Cents(10000), dayOfMonth = 15),
            createTestRule(merchant = "Water", amount = Cents(5000), dayOfMonth = 15),
        )

        val calendar = BillReminderEngine.generateMonthlyCalendar(
            rules = rules,
            year = 2024,
            month = 6,
            today = LocalDate(2024, 6, 1),
        )

        assertEquals(2, calendar.billCount)
        assertEquals(Cents(15000), calendar.totalDue, "$100 + $50 = $150")
        assertEquals(1, calendar.days.size, "Both bills on same day")
        assertEquals(2, calendar.days.first().bills.size)
    }

    @Test
    fun billCalendar_paidBill_markedAsPaid() {
        val rule = createTestRule(merchant = "Internet", amount = Cents(8000), dayOfMonth = 10)

        val calendar = BillReminderEngine.generateMonthlyCalendar(
            rules = listOf(rule),
            year = 2024,
            month = 6,
            today = LocalDate(2024, 6, 15),
            paidBills = setOf(Pair(rule.id, LocalDate(2024, 6, 10))),
        )

        val entry = calendar.days.first().bills.first()
        assertTrue(entry.isPaid, "Bill marked as paid")
        assertFalse(entry.isOverdue, "Paid bill is not overdue")
    }

    @Test
    fun billCalendar_unpaidPastDue_markedAsOverdue() {
        val rule = createTestRule(merchant = "Rent", amount = Cents(150000), dayOfMonth = 1)

        val calendar = BillReminderEngine.generateMonthlyCalendar(
            rules = listOf(rule),
            year = 2024,
            month = 6,
            today = LocalDate(2024, 6, 15),
        )

        val entry = calendar.days.first().bills.first()
        assertFalse(entry.isPaid)
        assertTrue(entry.isOverdue, "Unpaid bill past due date is overdue")
    }

    @Test
    fun billCalendar_paidFraction_calculatedCorrectly() {
        val rules = listOf(
            createTestRule(merchant = "Bill A", amount = Cents(1000), dayOfMonth = 5),
            createTestRule(merchant = "Bill B", amount = Cents(2000), dayOfMonth = 10),
        )

        val calendar = BillReminderEngine.generateMonthlyCalendar(
            rules = rules,
            year = 2024,
            month = 6,
            today = LocalDate(2024, 6, 15),
            paidBills = setOf(Pair(rules[0].id, LocalDate(2024, 6, 5))),
        )

        assertEquals(0.5, calendar.paidFraction, 0.01, "1 of 2 bills paid = 50%")
    }

    @Test
    fun billCalendar_totalRemaining_totalDueMinusPaid() {
        val rules = listOf(
            createTestRule(merchant = "A", amount = Cents(10000), dayOfMonth = 5),
            createTestRule(merchant = "B", amount = Cents(20000), dayOfMonth = 15),
        )

        val calendar = BillReminderEngine.generateMonthlyCalendar(
            rules = rules,
            year = 2024,
            month = 6,
            today = LocalDate(2024, 6, 10),
            paidBills = setOf(Pair(rules[0].id, LocalDate(2024, 6, 5))),
        )

        assertEquals(Cents(30000), calendar.totalDue)
        assertEquals(Cents(10000), calendar.totalPaid)
        assertEquals(Cents(20000), calendar.totalRemaining, "Remaining = $300 - $100 = $200")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Notification timing calculation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun notification_scheduledDaysBeforeDue() {
        val rule = createTestRule(merchant = "Insurance", amount = Cents(50000), dayOfMonth = 20)
        val reminder = BillReminder(
            id = SyncId("reminder-1"),
            ruleId = rule.id,
            ownerId = SyncId("owner-1"),
            offsetDays = 3,
        )

        val notifications = BillReminderEngine.scheduleNotifications(
            rules = listOf(rule),
            reminders = mapOf(rule.id to reminder),
            today = LocalDate(2024, 6, 1),
        )

        assertEquals(1, notifications.size)
        assertEquals(LocalDate(2024, 6, 20), notifications.first().dueDate)
        assertEquals(LocalDate(2024, 6, 17), notifications.first().notificationDate, "3 days before due")
    }

    @Test
    fun notification_sameDayReminder_offsetZero() {
        val rule = createTestRule(merchant = "Bill", amount = Cents(5000), dayOfMonth = 15)
        val reminder = BillReminder(
            id = SyncId("reminder-2"),
            ruleId = rule.id,
            ownerId = SyncId("owner-1"),
            offsetDays = 0,
        )

        val notifications = BillReminderEngine.scheduleNotifications(
            rules = listOf(rule),
            reminders = mapOf(rule.id to reminder),
            today = LocalDate(2024, 6, 1),
        )

        assertEquals(1, notifications.size)
        assertEquals(notifications.first().dueDate, notifications.first().notificationDate, "Same day reminder")
    }

    @Test
    fun notification_unconfirmedRule_skipped() {
        val rule = createTestRule(merchant = "Unconfirmed", amount = Cents(1000), dayOfMonth = 10, isConfirmed = false)
        val reminder = BillReminder(
            id = SyncId("reminder-3"),
            ruleId = rule.id,
            ownerId = SyncId("owner-1"),
        )

        val notifications = BillReminderEngine.scheduleNotifications(
            rules = listOf(rule),
            reminders = mapOf(rule.id to reminder),
            today = LocalDate(2024, 6, 1),
        )

        assertTrue(notifications.isEmpty(), "Unconfirmed rules don't generate notifications")
    }

    @Test
    fun notification_disabledReminder_skipped() {
        val rule = createTestRule(merchant = "Disabled", amount = Cents(1000), dayOfMonth = 10)
        val reminder = BillReminder(
            id = SyncId("reminder-4"),
            ruleId = rule.id,
            ownerId = SyncId("owner-1"),
            isEnabled = false,
        )

        val notifications = BillReminderEngine.scheduleNotifications(
            rules = listOf(rule),
            reminders = mapOf(rule.id to reminder),
            today = LocalDate(2024, 6, 1),
        )

        assertTrue(notifications.isEmpty(), "Disabled reminders don't generate notifications")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Bill amount change detection
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun amountChange_detected() {
        val history = listOf(
            BillAmountRecord(LocalDate(2024, 4, 15), Cents(5000)),
            BillAmountRecord(LocalDate(2024, 5, 15), Cents(5000)),
            BillAmountRecord(LocalDate(2024, 6, 15), Cents(6000)),
        )

        val change = BillReminderEngine.detectAmountChange(SyncId("rule-1"), "Service", history)
        assertNotNull(change)
        assertEquals(Cents(1000), change.amountChange, "+$10 increase")
        assertTrue(change.isIncrease)
        assertEquals(20.0, change.changePercentage, 0.01, "20% increase")
        assertTrue(change.isSignificant, ">10% is significant")
    }

    @Test
    fun amountChange_noChange_returnsNull() {
        val history = listOf(
            BillAmountRecord(LocalDate(2024, 5, 15), Cents(5000)),
            BillAmountRecord(LocalDate(2024, 6, 15), Cents(5000)),
        )

        val change = BillReminderEngine.detectAmountChange(SyncId("rule-1"), "Service", history)
        assertNull(change, "Same amount → no change")
    }

    @Test
    fun amountChange_tooFewRecords_returnsNull() {
        val history = listOf(
            BillAmountRecord(LocalDate(2024, 6, 15), Cents(5000)),
        )

        val change = BillReminderEngine.detectAmountChange(SyncId("rule-1"), "Service", history)
        assertNull(change, "Need at least 2 records")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════════

    private var ruleCounter = 0

    private fun createTestRule(
        merchant: String,
        amount: Cents,
        frequency: RecurrenceFrequency = RecurrenceFrequency.MONTHLY,
        dayOfMonth: Int = 1,
        startDate: LocalDate = LocalDate(2024, 1, dayOfMonth),
        isConfirmed: Boolean = true,
    ): RecurringTransactionRule {
        val ruleId = SyncId("rule-${++ruleCounter}")
        return RecurringTransactionRule(
            id = ruleId,
            ownerId = SyncId("owner-1"),
            householdId = SyncId("hh-1"),
            merchant = merchant,
            amount = amount,
            currency = Currency.USD,
            accountId = SyncId("acct-1"),
            recurrenceRule = RecurrenceRule(
                id = SyncId("recurrence-${ruleCounter}"),
                frequency = frequency,
                startDate = startDate,
                dayOfMonth = dayOfMonth,
            ),
            nextDueDate = LocalDate(2024, 6, dayOfMonth),
            isConfirmed = isConfirmed,
            createdAt = TestFixtures.fixedInstant,
            updatedAt = TestFixtures.fixedInstant,
        )
    }
}
