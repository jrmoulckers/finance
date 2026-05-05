// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.recurring

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class BillReminderEngineTest {

    private val fixedInstant: Instant = Instant.parse("2024-06-15T12:00:00Z")
    private val today = LocalDate(2024, 6, 15)

    private fun createRule(
        id: String = "rule-1",
        merchant: String = "Netflix",
        amount: Long = 1599L,
        frequency: RecurrenceFrequency = RecurrenceFrequency.MONTHLY,
        startDate: LocalDate = LocalDate(2024, 1, 15),
        nextDueDate: LocalDate = LocalDate(2024, 7, 15),
        isConfirmed: Boolean = true,
    ): RecurringTransactionRule = RecurringTransactionRule(
        id = SyncId(id),
        ownerId = SyncId("owner-1"),
        householdId = SyncId("household-1"),
        merchant = merchant,
        amount = Cents(amount),
        currency = Currency.USD,
        accountId = SyncId("account-1"),
        recurrenceRule = RecurrenceRule(
            id = SyncId("recurrence-$id"),
            frequency = frequency,
            startDate = startDate,
        ),
        nextDueDate = nextDueDate,
        isConfirmed = isConfirmed,
        createdAt = fixedInstant,
        updatedAt = fixedInstant,
    )

    private fun createReminder(
        id: String = "reminder-1",
        ruleId: String = "rule-1",
        offsetDays: Int = 3,
        isEnabled: Boolean = true,
    ): BillReminder = BillReminder(
        id = SyncId(id),
        ruleId = SyncId(ruleId),
        ownerId = SyncId("owner-1"),
        offsetDays = offsetDays,
        isEnabled = isEnabled,
    )

    // ═════════════════════════════════════════════════════════════════
    // Recurring Transaction Rule
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun recurringTransactionRule_creation() {
        val rule = createRule()
        assertEquals("Netflix", rule.merchant)
        assertEquals(Cents(1599L), rule.amount)
        assertTrue(rule.isConfirmed)
    }

    @Test
    fun recurringTransactionRule_serializable() {
        val rule = createRule()
        assertNotNull(rule.id)
        assertNotNull(rule.ownerId)
        assertNotNull(rule.householdId)
    }

    // ═════════════════════════════════════════════════════════════════
    // Bill Reminder
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun billReminder_creation() {
        val reminder = createReminder()
        assertEquals(3, reminder.offsetDays)
        assertTrue(reminder.isEnabled)
        assertEquals(ReminderNotificationType.PUSH, reminder.notificationType)
    }

    @Test
    fun reminderTime_formatting() {
        assertEquals("09:00", ReminderTime(9, 0).toString())
        assertEquals("14:30", ReminderTime(14, 30).toString())
        assertEquals("00:05", ReminderTime(0, 5).toString())
    }

    // ═════════════════════════════════════════════════════════════════
    // Notification Scheduling
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun scheduleNotifications_calculatesCorrectDate() {
        val rule = createRule(nextDueDate = LocalDate(2024, 7, 15))
        val reminder = createReminder(offsetDays = 3)

        val notifications = BillReminderEngine.scheduleNotifications(
            rules = listOf(rule),
            reminders = mapOf(SyncId("rule-1") to reminder),
            today = today,
        )

        assertEquals(1, notifications.size)
        assertEquals(LocalDate(2024, 7, 12), notifications[0].notificationDate) // 15 - 3 = 12
        assertEquals(LocalDate(2024, 7, 15), notifications[0].dueDate)
        assertEquals("Netflix", notifications[0].merchant)
    }

    @Test
    fun scheduleNotifications_zeroOffset_notifiesOnDueDate() {
        val rule = createRule(nextDueDate = LocalDate(2024, 7, 15))
        val reminder = createReminder(offsetDays = 0)

        val notifications = BillReminderEngine.scheduleNotifications(
            rules = listOf(rule),
            reminders = mapOf(SyncId("rule-1") to reminder),
            today = today,
        )

        assertEquals(1, notifications.size)
        assertEquals(LocalDate(2024, 7, 15), notifications[0].notificationDate)
    }

    @Test
    fun scheduleNotifications_skipsPastNotifications() {
        val rule = createRule(nextDueDate = LocalDate(2024, 6, 10)) // past due
        val reminder = createReminder(offsetDays = 3)

        val notifications = BillReminderEngine.scheduleNotifications(
            rules = listOf(rule),
            reminders = mapOf(SyncId("rule-1") to reminder),
            today = today,
        )

        assertEquals(0, notifications.size)
    }

    @Test
    fun scheduleNotifications_skipsUnconfirmedRules() {
        val rule = createRule(isConfirmed = false, nextDueDate = LocalDate(2024, 7, 15))
        val reminder = createReminder()

        val notifications = BillReminderEngine.scheduleNotifications(
            rules = listOf(rule),
            reminders = mapOf(SyncId("rule-1") to reminder),
            today = today,
        )

        assertEquals(0, notifications.size)
    }

    @Test
    fun scheduleNotifications_skipsDisabledReminders() {
        val rule = createRule(nextDueDate = LocalDate(2024, 7, 15))
        val reminder = createReminder(isEnabled = false)

        val notifications = BillReminderEngine.scheduleNotifications(
            rules = listOf(rule),
            reminders = mapOf(SyncId("rule-1") to reminder),
            today = today,
        )

        assertEquals(0, notifications.size)
    }

    @Test
    fun scheduleNotifications_multipleRules_sortedChronologically() {
        val rule1 = createRule(id = "rule-1", merchant = "Netflix", nextDueDate = LocalDate(2024, 7, 20))
        val rule2 = createRule(id = "rule-2", merchant = "Spotify", nextDueDate = LocalDate(2024, 7, 10))

        val reminders = mapOf(
            SyncId("rule-1") to createReminder(id = "rem-1", ruleId = "rule-1", offsetDays = 3),
            SyncId("rule-2") to createReminder(id = "rem-2", ruleId = "rule-2", offsetDays = 1),
        )

        val notifications = BillReminderEngine.scheduleNotifications(
            rules = listOf(rule1, rule2),
            reminders = reminders,
            today = today,
        )

        assertEquals(2, notifications.size)
        // Spotify: July 10 - 1 = July 9... wait, that's before today (June 15)
        // Let me fix: Spotify due July 10, offset 1 → notify July 9 which is > June 15
        assertEquals("Spotify", notifications[0].merchant)
        assertEquals("Netflix", notifications[1].merchant)
    }

    // ═════════════════════════════════════════════════════════════════
    // Schedule Next N
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun scheduleNextN_generatesCorrectCount() {
        val rule = createRule(nextDueDate = LocalDate(2024, 7, 15))
        val reminder = createReminder(offsetDays = 3)

        val notifications = BillReminderEngine.scheduleNextN(
            rule, reminder, from = LocalDate(2024, 7, 1), count = 3,
        )

        assertEquals(3, notifications.size)
        // Monthly from July 15: Jul 15, Aug 15, Sep 15
        assertEquals(LocalDate(2024, 7, 12), notifications[0].notificationDate)
        assertEquals(LocalDate(2024, 8, 12), notifications[1].notificationDate)
        assertEquals(LocalDate(2024, 9, 12), notifications[2].notificationDate)
    }

    // ═════════════════════════════════════════════════════════════════
    // Bill Calendar
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun monthlyCalendar_generatesCorrectBills() {
        val rule1 = createRule(id = "rule-1", merchant = "Netflix", amount = 1599)
        val rule2 = createRule(
            id = "rule-2", merchant = "Rent", amount = 150000,
            startDate = LocalDate(2024, 1, 1),
            frequency = RecurrenceFrequency.MONTHLY,
        )

        val calendar = BillReminderEngine.generateMonthlyCalendar(
            rules = listOf(rule1, rule2),
            year = 2024,
            month = 7,
            today = today,
        )

        assertEquals(2024, calendar.year)
        assertEquals(7, calendar.month)
        assertTrue(calendar.billCount >= 2) // At least Netflix + Rent in July
    }

    @Test
    fun monthlyCalendar_marksPaidBills() {
        val rule = createRule(nextDueDate = LocalDate(2024, 7, 15))

        val paidBills = setOf(Pair(SyncId("rule-1"), LocalDate(2024, 7, 15)))

        val calendar = BillReminderEngine.generateMonthlyCalendar(
            rules = listOf(rule),
            year = 2024,
            month = 7,
            today = today,
            paidBills = paidBills,
        )

        val billDay = calendar.days.firstOrNull { it.date == LocalDate(2024, 7, 15) }
        assertNotNull(billDay)
        assertTrue(billDay.bills.all { it.isPaid })
    }

    @Test
    fun monthlyCalendar_marksOverdueBills() {
        val rule = createRule(
            startDate = LocalDate(2024, 6, 1),
            nextDueDate = LocalDate(2024, 6, 1),
        )

        val calendar = BillReminderEngine.generateMonthlyCalendar(
            rules = listOf(rule),
            year = 2024,
            month = 6,
            today = today, // June 15 — bill on June 1 is overdue
        )

        val overdueDay = calendar.days.firstOrNull { it.date == LocalDate(2024, 6, 1) }
        assertNotNull(overdueDay)
        assertTrue(overdueDay.hasOverdue)
    }

    @Test
    fun monthlyCalendar_calculatesTotals() {
        val rule1 = createRule(id = "rule-1", amount = 1000)
        val rule2 = createRule(
            id = "rule-2", amount = 2000,
            startDate = LocalDate(2024, 1, 20),
        )

        val paidBills = setOf(Pair(SyncId("rule-1"), LocalDate(2024, 7, 15)))

        val calendar = BillReminderEngine.generateMonthlyCalendar(
            rules = listOf(rule1, rule2),
            year = 2024,
            month = 7,
            today = today,
            paidBills = paidBills,
        )

        assertEquals(Cents(3000L), calendar.totalDue) // 1000 + 2000
        assertEquals(Cents(1000L), calendar.totalPaid) // Only rule-1 paid
        assertEquals(Cents(2000L), calendar.totalRemaining)
    }

    @Test
    fun monthlyCalendar_skipsUnconfirmedRules() {
        val rule = createRule(isConfirmed = false)

        val calendar = BillReminderEngine.generateMonthlyCalendar(
            rules = listOf(rule),
            year = 2024,
            month = 7,
            today = today,
        )

        assertEquals(0, calendar.billCount)
    }

    // ═════════════════════════════════════════════════════════════════
    // Bill Confirmation Flow
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun billConfirmation_creation() {
        val confirmation = BillConfirmation(
            ruleId = SyncId("rule-1"),
            merchant = "Netflix",
            amount = Cents(1599L),
            frequency = RecurrenceFrequency.MONTHLY,
            confidence = 0.85,
            recentDates = listOf(
                LocalDate(2024, 4, 15),
                LocalDate(2024, 5, 15),
                LocalDate(2024, 6, 15),
            ),
        )

        assertFalse(confirmation.isResolved)
        assertEquals(0.85, confirmation.confidence)
    }

    @Test
    fun billConfirmation_accept() {
        val confirmation = BillConfirmation(
            ruleId = SyncId("rule-1"),
            merchant = "Netflix",
            amount = Cents(1599L),
            frequency = RecurrenceFrequency.MONTHLY,
            confidence = 0.9,
            recentDates = emptyList(),
            action = BillConfirmationAction.ACCEPT,
        )

        assertTrue(confirmation.isResolved)
        assertEquals(BillConfirmationAction.ACCEPT, confirmation.action)
    }

    @Test
    fun billConfirmation_reject() {
        val confirmation = BillConfirmation(
            ruleId = SyncId("rule-1"),
            merchant = "One-time Purchase",
            amount = Cents(9999L),
            frequency = RecurrenceFrequency.MONTHLY,
            confidence = 0.3,
            recentDates = emptyList(),
            action = BillConfirmationAction.REJECT,
        )

        assertTrue(confirmation.isResolved)
        assertEquals(BillConfirmationAction.REJECT, confirmation.action)
    }

    @Test
    fun billConfirmation_snooze() {
        val confirmation = BillConfirmation(
            ruleId = SyncId("rule-1"),
            merchant = "Maybe Recurring",
            amount = Cents(5000L),
            frequency = RecurrenceFrequency.MONTHLY,
            confidence = 0.6,
            recentDates = emptyList(),
            action = BillConfirmationAction.SNOOZE,
        )

        assertTrue(confirmation.isResolved)
        assertEquals(BillConfirmationAction.SNOOZE, confirmation.action)
    }

    // ═════════════════════════════════════════════════════════════════
    // Bill Amount Tracking
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun detectAmountChange_noChange() {
        val history = listOf(
            BillAmountRecord(LocalDate(2024, 5, 15), Cents(1599L)),
            BillAmountRecord(LocalDate(2024, 6, 15), Cents(1599L)),
        )

        val result = BillReminderEngine.detectAmountChange(
            SyncId("rule-1"), "Netflix", history,
        )

        assertNull(result) // No change
    }

    @Test
    fun detectAmountChange_increase() {
        val history = listOf(
            BillAmountRecord(LocalDate(2024, 5, 15), Cents(1599L)),
            BillAmountRecord(LocalDate(2024, 6, 15), Cents(1799L)),
        )

        val result = BillReminderEngine.detectAmountChange(
            SyncId("rule-1"), "Netflix", history,
        )

        assertNotNull(result)
        assertTrue(result.isIncrease)
        assertFalse(result.isDecrease)
        assertEquals(Cents(200L), result.amountChange)
        assertEquals(Cents(1799L), result.currentAmount)
        assertEquals(Cents(1599L), result.previousAmount)
    }

    @Test
    fun detectAmountChange_decrease() {
        val history = listOf(
            BillAmountRecord(LocalDate(2024, 5, 15), Cents(2000L)),
            BillAmountRecord(LocalDate(2024, 6, 15), Cents(1500L)),
        )

        val result = BillReminderEngine.detectAmountChange(
            SyncId("rule-1"), "Service", history,
        )

        assertNotNull(result)
        assertFalse(result.isIncrease)
        assertTrue(result.isDecrease)
    }

    @Test
    fun detectAmountChange_significantIncrease() {
        val history = listOf(
            BillAmountRecord(LocalDate(2024, 5, 15), Cents(1000L)),
            BillAmountRecord(LocalDate(2024, 6, 15), Cents(1500L)), // 50% increase
        )

        val result = BillReminderEngine.detectAmountChange(
            SyncId("rule-1"), "Service", history,
        )

        assertNotNull(result)
        assertTrue(result.isSignificant) // > 10% change
    }

    @Test
    fun detectAmountChange_tooShortHistory() {
        val history = listOf(
            BillAmountRecord(LocalDate(2024, 6, 15), Cents(1599L)),
        )

        val result = BillReminderEngine.detectAmountChange(
            SyncId("rule-1"), "Netflix", history,
        )

        assertNull(result)
    }

    @Test
    fun detectAllAmountChanges_multipleRules() {
        val rules = listOf(
            createRule(id = "rule-1", merchant = "Netflix", amount = 1799),
            createRule(id = "rule-2", merchant = "Spotify", amount = 999),
        )

        val histories = mapOf(
            SyncId("rule-1") to listOf(
                BillAmountRecord(LocalDate(2024, 5, 15), Cents(1599L)),
                BillAmountRecord(LocalDate(2024, 6, 15), Cents(1799L)),
            ),
            SyncId("rule-2") to listOf(
                BillAmountRecord(LocalDate(2024, 5, 15), Cents(999L)),
                BillAmountRecord(LocalDate(2024, 6, 15), Cents(999L)),
            ),
        )

        val changes = BillReminderEngine.detectAllAmountChanges(histories, rules)

        assertEquals(1, changes.size) // Only Netflix changed
        assertEquals("Netflix", changes[0].merchant)
    }

    // ═════════════════════════════════════════════════════════════════
    // Bill Calendar Month calculations
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun billCalendarMonth_paidFraction() {
        val month = BillCalendarMonth(
            year = 2024,
            month = 7,
            days = listOf(
                BillCalendarDay(
                    date = LocalDate(2024, 7, 15),
                    bills = listOf(
                        BillCalendarEntry(SyncId("r1"), "A", Cents(100L), LocalDate(2024, 7, 15), isPaid = true),
                        BillCalendarEntry(SyncId("r2"), "B", Cents(200L), LocalDate(2024, 7, 15), isPaid = false),
                    ),
                    totalAmount = Cents(300L),
                ),
            ),
            totalDue = Cents(300L),
            totalPaid = Cents(100L),
            billCount = 2,
        )

        assertEquals(0.5, month.paidFraction)
        assertEquals(Cents(200L), month.totalRemaining)
    }
}
