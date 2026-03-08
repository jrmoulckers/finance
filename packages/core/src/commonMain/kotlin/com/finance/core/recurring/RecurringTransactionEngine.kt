// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.recurring

import com.finance.models.Transaction
import com.finance.models.TransactionStatus
import com.finance.models.types.SyncId
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlinx.datetime.number
import kotlinx.datetime.plus

/**
 * Pure-function engine for generating occurrence dates from [RecurrenceRule]s,
 * stamping concrete [Transaction]s, and detecting overdue bills.
 *
 * All functions are deterministic and side-effect-free so they can be
 * tested trivially and run on any KMP target.
 */
object RecurringTransactionEngine {

    // ── Occurrence generation ────────────────────────────────────────

    /**
     * Generate every occurrence date of [rule] that falls within `[from, to]` (inclusive).
     *
     * The algorithm walks forward from [RecurrenceRule.startDate] by the rule's
     * frequency × interval, skipping dates before [from] and stopping after [to]
     * or [RecurrenceRule.endDate], whichever comes first.
     *
     * For MONTHLY rules with [RecurrenceRule.dayOfMonth] the day is clamped to
     * the last valid day of each month (e.g., 31 → 28 for February).
     *
     * @return Sorted list of [LocalDate]s in ascending order.
     */
    fun generateUpcoming(
        rule: RecurrenceRule,
        from: LocalDate,
        to: LocalDate,
    ): List<LocalDate> {
        require(from <= to) { "from ($from) must be <= to ($to)" }

        val effectiveEnd = when {
            rule.endDate != null && rule.endDate < to -> rule.endDate
            else -> to
        }

        val dates = mutableListOf<LocalDate>()
        var current = rule.startDate

        while (current <= effectiveEnd) {
            if (current >= from) {
                dates.add(current)
            }
            val previous = current
            current = nextOccurrence(current, rule)
            // Safety: if nextOccurrence didn't advance, break to avoid infinite loop.
            if (current <= previous) break
        }

        return dates
    }

    // ── Transaction stamping ─────────────────────────────────────────

    /**
     * Create a concrete [Transaction] from a template and a specific occurrence [date].
     *
     * The returned transaction:
     *   - receives a new unique [SyncId] (deterministic from rule + date for idempotency),
     *   - is marked `isRecurring = true`,
     *   - carries the rule's [RecurrenceRule.id] as `recurringRuleId`,
     *   - starts in [TransactionStatus.PENDING].
     *
     * @param template The recurring transaction template (payee, amount, category, etc.).
     * @param rule The [RecurrenceRule] that governs this schedule.
     * @param date The concrete occurrence date.
     * @return A new, immutable [Transaction] ready to be persisted.
     */
    fun createFromRecurring(
        template: Transaction,
        rule: RecurrenceRule,
        date: LocalDate,
    ): Transaction {
        // Deterministic ID: "rec-{ruleId}-{date}" ensures idempotent generation.
        val generatedId = SyncId("rec-${rule.id.value}-$date")

        return template.copy(
            id = generatedId,
            date = date,
            status = TransactionStatus.PENDING,
            isRecurring = true,
            recurringRuleId = rule.id,
        )
    }

    // ── Overdue detection ────────────────────────────────────────────

    /**
     * For each rule + template pair, find every occurrence on or before [today]
     * and emit a [Reminder] marked as overdue.
     *
     * A reminder is overdue when the occurrence date ≤ [today].
     * This intentionally only returns *overdue* reminders; upcoming-but-not-yet-due
     * reminders should be built by combining [generateUpcoming] with a future window.
     *
     * @param rules Pairs of (recurrence rule, transaction template).
     * @param today The reference date (typically `Clock.System.todayIn(tz)`).
     * @return List of [Reminder]s sorted by due date ascending.
     */
    fun getOverdueReminders(
        rules: List<Pair<RecurrenceRule, Transaction>>,
        today: LocalDate,
    ): List<Reminder> {
        return rules.flatMap { (rule, template) ->
            // Rule hasn't started yet — no overdue occurrences possible.
            if (rule.startDate > today) return@flatMap emptyList()

            generateUpcoming(rule, from = rule.startDate, to = today)
                .map { dueDate ->
                    val daysOverdue = daysBetween(dueDate, today)
                    Reminder(
                        transactionTemplate = template,
                        ruleId = rule.id,
                        dueDate = dueDate,
                        daysBefore = daysOverdue,
                        isOverdue = true,
                    )
                }
        }.sortedBy { it.dueDate }
    }

    // ── Internal helpers ─────────────────────────────────────────────

    /**
     * Compute the next occurrence date after [current] according to [rule].
     */
    internal fun nextOccurrence(current: LocalDate, rule: RecurrenceRule): LocalDate {
        return when (rule.frequency) {
            RecurrenceFrequency.DAILY ->
                current.plus(rule.interval, DateTimeUnit.DAY)

            RecurrenceFrequency.WEEKLY ->
                advanceWeekly(current, rule.interval, rule.dayOfWeek)

            RecurrenceFrequency.BIWEEKLY ->
                advanceWeekly(current, rule.interval * 2, rule.dayOfWeek)

            RecurrenceFrequency.MONTHLY ->
                advanceMonthly(current, rule.interval, rule.dayOfMonth)

            RecurrenceFrequency.YEARLY ->
                advanceYearly(current, rule.interval, rule.dayOfMonth)
        }
    }

    private fun advanceWeekly(
        current: LocalDate,
        weeks: Int,
        preferredDay: DayOfWeek?,
    ): LocalDate {
        val advanced = current.plus(weeks, DateTimeUnit.WEEK)
        if (preferredDay == null) return advanced
        // Snap to the preferred day within the same ISO week.
        val diff = preferredDay.ordinal - advanced.dayOfWeek.ordinal
        return advanced.plus(diff, DateTimeUnit.DAY)
    }

    private fun advanceMonthly(
        current: LocalDate,
        months: Int,
        dayOfMonth: Int?,
    ): LocalDate {
        val nextMonth = current.plus(months, DateTimeUnit.MONTH)
        val targetDay = dayOfMonth ?: current.dayOfMonth
        return clampDay(nextMonth.year, nextMonth.month.number, targetDay)
    }

    private fun advanceYearly(
        current: LocalDate,
        years: Int,
        dayOfMonth: Int?,
    ): LocalDate {
        val nextYear = current.plus(years, DateTimeUnit.YEAR)
        val targetDay = dayOfMonth ?: current.dayOfMonth
        return clampDay(nextYear.year, nextYear.month.number, targetDay)
    }

    /**
     * Construct a [LocalDate] clamping the day to the valid range for the given
     * year/month. Handles Feb-29 in non-leap years, short months, etc.
     */
    private fun clampDay(year: Int, month: Int, day: Int): LocalDate {
        val lastDay = lastDayOfMonth(year, month)
        return LocalDate(year, month, minOf(day, lastDay))
    }

    private fun lastDayOfMonth(year: Int, month: Int): Int {
        return when (month) {
            1 -> 31; 2 -> if (isLeapYear(year)) 29 else 28; 3 -> 31
            4 -> 30; 5 -> 31; 6 -> 30; 7 -> 31; 8 -> 31
            9 -> 30; 10 -> 31; 11 -> 30; 12 -> 31
            else -> throw IllegalArgumentException("Invalid month: $month")
        }
    }

    private fun isLeapYear(year: Int): Boolean =
        (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)

    /**
     * Simple day-count between two dates. Always returns a non-negative value.
     */
    private fun daysBetween(from: LocalDate, to: LocalDate): Int {
        var count = 0
        var d = from
        while (d < to) {
            d = d.plus(1, DateTimeUnit.DAY)
            count++
        }
        return count
    }
}
