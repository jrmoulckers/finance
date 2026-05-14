// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.recurring

import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.minus
import kotlinx.datetime.number
import kotlinx.datetime.plus

/**
 * Engine for bill reminder scheduling, calendar generation, and amount change tracking.
 *
 * All functions are pure and deterministic — no side effects, no I/O.
 * Platform notification scheduling (actual OS-level alarms) is the
 * caller's responsibility; this engine only computes the data.
 */
object BillReminderEngine {

    // ═════════════════════════════════════════════════════════════════
    // Reminder Scheduling
    // ═════════════════════════════════════════════════════════════════

    /**
     * Calculate the next notification times for a set of bill reminders.
     *
     * For each rule+reminder pair, computes when the notification should fire
     * based on the rule's next due date and the reminder's offset.
     *
     * @param rules Active recurring transaction rules.
     * @param reminders Bill reminder configurations keyed by rule ID.
     * @param today Reference date for filtering (only future notifications returned).
     * @return Sorted list of [ScheduledNotification]s in chronological order.
     */
    fun scheduleNotifications(
        rules: List<RecurringTransactionRule>,
        reminders: Map<SyncId, BillReminder>,
        today: LocalDate,
    ): List<ScheduledNotification> {
        val notifications = mutableListOf<ScheduledNotification>()

        @Suppress("LoopWithTooManyJumpStatements")
        for (rule in rules) {
            if (!rule.isConfirmed) continue
            val reminder = reminders[rule.id] ?: continue
            if (!reminder.isEnabled) continue

            val notificationDate = rule.nextDueDate.minus(reminder.offsetDays, DateTimeUnit.DAY)

            // Only include future or today's notifications
            if (notificationDate >= today) {
                notifications.add(
                    ScheduledNotification(
                        ruleId = rule.id,
                        reminderId = reminder.id,
                        dueDate = rule.nextDueDate,
                        notificationDate = notificationDate,
                        notificationTime = reminder.reminderTime,
                        merchant = rule.merchant,
                    ),
                )
            }
        }

        return notifications.sortedBy { it.notificationDate }
    }

    /**
     * Calculate notification times for the next N occurrences of a rule.
     *
     * @param rule The recurring transaction rule.
     * @param reminder The bill reminder configuration.
     * @param from Start date for occurrence generation.
     * @param count Number of future occurrences to generate.
     * @return List of [ScheduledNotification]s for the next [count] occurrences.
     */
    fun scheduleNextN(
        rule: RecurringTransactionRule,
        reminder: BillReminder,
        from: LocalDate,
        count: Int,
    ): List<ScheduledNotification> {
        require(count > 0) { "Count must be positive, was $count" }

        val endDate = from.plus(365 * 2, DateTimeUnit.DAY) // 2-year horizon
        val occurrences = RecurringTransactionEngine.generateUpcoming(
            rule.recurrenceRule, from, endDate,
        ).take(count)

        return occurrences.map { dueDate ->
            val notifDate = dueDate.minus(reminder.offsetDays, DateTimeUnit.DAY)
            ScheduledNotification(
                ruleId = rule.id,
                reminderId = reminder.id,
                dueDate = dueDate,
                notificationDate = notifDate,
                notificationTime = reminder.reminderTime,
                merchant = rule.merchant,
            )
        }
    }

    // ═════════════════════════════════════════════════════════════════
    // Bill Calendar
    // ═════════════════════════════════════════════════════════════════

    /**
     * Generate a monthly bill calendar view.
     *
     * Computes all bill occurrences for the specified month, marks paid/overdue
     * status, and aggregates totals.
     *
     * @param rules Active recurring transaction rules.
     * @param year Calendar year.
     * @param month Calendar month (1–12).
     * @param today Reference date for overdue detection.
     * @param paidBills Set of (ruleId, dueDate) pairs for bills already paid.
     * @return [BillCalendarMonth] with all bills for the month.
     */
    fun generateMonthlyCalendar(
        rules: List<RecurringTransactionRule>,
        year: Int,
        month: Int,
        today: LocalDate,
        paidBills: Set<Pair<SyncId, LocalDate>> = emptySet(),
    ): BillCalendarMonth {
        val firstDay = LocalDate(year, month, 1)
        val lastDay = lastDayOfMonth(year, month)

        val dayMap = mutableMapOf<LocalDate, MutableList<BillCalendarEntry>>()

        for (rule in rules) {
            if (!rule.isConfirmed) continue

            val occurrences = RecurringTransactionEngine.generateUpcoming(
                rule.recurrenceRule, firstDay, lastDay,
            )

            for (dueDate in occurrences) {
                val isPaid = Pair(rule.id, dueDate) in paidBills
                val isOverdue = !isPaid && dueDate < today

                val entry = BillCalendarEntry(
                    ruleId = rule.id,
                    merchant = rule.merchant,
                    amount = rule.amount,
                    dueDate = dueDate,
                    isPaid = isPaid,
                    isOverdue = isOverdue,
                )

                dayMap.getOrPut(dueDate) { mutableListOf() }.add(entry)
            }
        }

        val days = dayMap.entries.sortedBy { it.key }.map { (date, bills) ->
            BillCalendarDay(
                date = date,
                bills = bills,
                totalAmount = Cents(bills.sumOf { it.amount.amount }),
            )
        }

        val allBills = days.flatMap { it.bills }
        val totalDue = Cents(allBills.sumOf { it.amount.amount })
        val totalPaid = Cents(allBills.filter { it.isPaid }.sumOf { it.amount.amount })

        return BillCalendarMonth(
            year = year,
            month = month,
            days = days,
            totalDue = totalDue,
            totalPaid = totalPaid,
            billCount = allBills.size,
        )
    }

    // ═════════════════════════════════════════════════════════════════
    // Bill Amount Tracking
    // ═════════════════════════════════════════════════════════════════

    /**
     * Detect amount changes for a recurring bill by comparing recent payments.
     *
     * @param ruleId The recurring rule ID.
     * @param merchant The merchant name.
     * @param history Chronologically ordered list of recent bill amounts.
     * @return [BillAmountChange] if there's been a change, or `null` if
     *         history is too short (< 2 records) or amounts are unchanged.
     */
    @Suppress("ReturnCount")
    fun detectAmountChange(
        ruleId: SyncId,
        merchant: String,
        history: List<BillAmountRecord>,
    ): BillAmountChange? {
        if (history.size < 2) return null

        val sorted = history.sortedBy { it.date }
        val current = sorted.last()
        val previous = sorted[sorted.size - 2]

        if (current.amount == previous.amount) return null

        val change = current.amount - previous.amount
        val percentChange = if (previous.amount.amount != 0L) {
            (change.amount.toDouble() / previous.amount.abs().amount) * 100.0
        } else {
            0.0
        }

        return BillAmountChange(
            ruleId = ruleId,
            merchant = merchant,
            currentAmount = current.amount,
            previousAmount = previous.amount,
            amountChange = change,
            changePercentage = percentChange,
            history = sorted,
        )
    }

    /**
     * Detect amount changes across all tracked bills.
     *
     * @param billHistories Map of rule ID to list of amount records.
     * @param rules Active rules for merchant name lookup.
     * @return List of [BillAmountChange]s for bills with detected changes.
     */
    fun detectAllAmountChanges(
        billHistories: Map<SyncId, List<BillAmountRecord>>,
        rules: List<RecurringTransactionRule>,
    ): List<BillAmountChange> {
        val ruleMap = rules.associateBy { it.id }
        return billHistories.mapNotNull { (ruleId, history) ->
            val rule = ruleMap[ruleId] ?: return@mapNotNull null
            detectAmountChange(ruleId, rule.merchant, history)
        }
    }

    // ═════════════════════════════════════════════════════════════════
    // Internal helpers
    // ═════════════════════════════════════════════════════════════════

    private fun lastDayOfMonth(year: Int, month: Int): LocalDate {
        val daysInMonth = when (month) {
            1 -> 31; 2 -> if (isLeapYear(year)) 29 else 28; 3 -> 31
            4 -> 30; 5 -> 31; 6 -> 30; 7 -> 31; 8 -> 31
            9 -> 30; 10 -> 31; 11 -> 30; 12 -> 31
            else -> throw IllegalArgumentException("Invalid month: $month")
        }
        return LocalDate(year, month, daysInMonth)
    }

    private fun isLeapYear(year: Int): Boolean =
        (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}
