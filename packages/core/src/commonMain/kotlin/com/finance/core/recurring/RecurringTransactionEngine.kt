// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.recurring

import com.finance.models.Transaction
import com.finance.models.TransactionStatus
import com.finance.models.types.SyncId
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlinx.datetime.minus
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

    private const val DAYS_PER_WEEK = 7

    /** Default number of days before `today` that [getOverdueReminders] scans for overdue bills. */
    const val DEFAULT_OVERDUE_LOOKBACK_DAYS: Int = 90

    /** Default cap on overdue occurrences emitted per rule by [getOverdueReminders]. */
    const val DEFAULT_OVERDUE_MAX_PER_RULE: Int = 50

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
    @Suppress("LoopWithTooManyJumpStatements")
    fun generateUpcoming(
        rule: RecurrenceRule,
        from: LocalDate,
        to: LocalDate,
    ): List<LocalDate> {
        require(from <= to) { "from ($from) must be <= to ($to)" }

        if (rule.isPaused) return emptyList()

        val effectiveEnd = when {
            rule.endDate != null && rule.endDate < to -> rule.endDate
            else -> to
        }

        val dates = mutableListOf<LocalDate>()
        var current = effectiveStart(rule)
        var occurrenceCount = 0

        while (current <= effectiveEnd) {
            // Respect the RRULE-style COUNT cap (counts every slot from startDate).
            if (rule.count != null && occurrenceCount >= rule.count) break
            occurrenceCount++

            if (current >= from && current !in rule.skipDates) {
                dates.add(current)
            }
            val previous = current
            current = nextOccurrence(current, rule)
            // Safety: if nextOccurrence didn't advance, break to avoid infinite loop.
            if (current <= previous) break
        }

        return dates
    }

    /**
     * Find the first occurrence of [rule] on or after [from].
     *
     * Unlike [generateUpcoming] this is a single-shot accessor that never materializes an
     * entire window. It respects [RecurrenceRule.endDate], [RecurrenceRule.count],
     * [RecurrenceRule.skipDates], and [RecurrenceRule.isPaused].
     *
     * @return The next occurrence date `>= from`, or `null` if the schedule has ended,
     *   is paused, or has no occurrence on/after [from].
     */
    @Suppress("LoopWithTooManyJumpStatements", "ReturnCount")
    fun nextOccurrenceOnOrAfter(
        rule: RecurrenceRule,
        from: LocalDate,
    ): LocalDate? {
        if (rule.isPaused) return null

        var current = effectiveStart(rule)
        var occurrenceCount = 0

        while (true) {
            if (rule.endDate != null && current > rule.endDate) return null
            if (rule.count != null && occurrenceCount >= rule.count) return null
            occurrenceCount++

            if (current >= from && current !in rule.skipDates) {
                return current
            }
            val previous = current
            current = nextOccurrence(current, rule)
            // Safety: if nextOccurrence didn't advance, no further occurrences exist.
            if (current <= previous) return null
        }
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
     * For each rule + template pair, find overdue occurrences on or before [today]
     * and emit a [Reminder] marked as overdue.
     *
     * A reminder is overdue when the occurrence date ≤ [today]. To keep the result bounded for
     * long-running rules (e.g. a DAILY rule started years ago), overdue detection only reaches back
     * [lookbackDays] days from [today] and caps the number of overdue occurrences emitted per rule
     * at [maxPerRule] (keeping the most recent ones). Occurrences already recorded/paid — identified
     * by a `(ruleId, dueDate)` pair in [paidOccurrences] — are excluded.
     *
     * This intentionally only returns *overdue* reminders; upcoming-but-not-yet-due
     * reminders should be built by combining [generateUpcoming] with a future window.
     *
     * @param rules Pairs of (recurrence rule, transaction template).
     * @param today The reference date (typically `Clock.System.todayIn(tz)`).
     * @param lookbackDays How many days before [today] overdue detection reaches (default 90).
     *   Must be non-negative.
     * @param maxPerRule Maximum overdue occurrences emitted per rule (default 50), keeping the most
     *   recent. Must be positive.
     * @param paidOccurrences `(ruleId, dueDate)` pairs already recorded/paid; excluded from output.
     * @return List of [Reminder]s sorted by due date ascending.
     */
    fun getOverdueReminders(
        rules: List<Pair<RecurrenceRule, Transaction>>,
        today: LocalDate,
        lookbackDays: Int = DEFAULT_OVERDUE_LOOKBACK_DAYS,
        maxPerRule: Int = DEFAULT_OVERDUE_MAX_PER_RULE,
        paidOccurrences: Set<Pair<SyncId, LocalDate>> = emptySet(),
    ): List<Reminder> {
        require(lookbackDays >= 0) { "lookbackDays must be non-negative, was $lookbackDays" }
        require(maxPerRule >= 1) { "maxPerRule must be at least 1, was $maxPerRule" }

        val windowStart = today.minus(lookbackDays, DateTimeUnit.DAY)

        return rules.flatMap { (rule, template) ->
            // Rule hasn't started yet — no overdue occurrences possible.
            if (rule.startDate > today) return@flatMap emptyList()

            val from = if (rule.startDate > windowStart) rule.startDate else windowStart

            generateUpcoming(rule, from = from, to = today)
                .filter { dueDate -> Pair(rule.id, dueDate) !in paidOccurrences }
                // Keep the most recent overdue occurrences when the window is dense.
                .takeLast(maxPerRule)
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
        // Anchor month/year recurrences on the rule's intended day-of-month so that
        // clamping in a short month never permanently shifts later occurrences
        // (e.g. a Jan-31 anchor must still land on Mar 31, not Mar 28).
        val anchorDay = rule.dayOfMonth ?: rule.startDate.dayOfMonth
        return when (rule.frequency) {
            RecurrenceFrequency.DAILY ->
                current.plus(rule.interval, DateTimeUnit.DAY)

            RecurrenceFrequency.WEEKLY ->
                advanceWeekly(current, rule.interval, rule.dayOfWeek)

            RecurrenceFrequency.BIWEEKLY ->
                advanceWeekly(current, rule.interval * 2, rule.dayOfWeek)

            RecurrenceFrequency.MONTHLY ->
                if (rule.nthWeekday != null && rule.dayOfWeek != null) {
                    advanceMonthlyPositional(current, rule.interval, rule.dayOfWeek, rule.nthWeekday)
                } else {
                    advanceMonthly(current, rule.interval, anchorDay)
                }

            RecurrenceFrequency.YEARLY ->
                advanceYearly(current, rule.interval, anchorDay)
        }
    }

    /**
     * Resolve the first concrete occurrence of [rule] (the date the series starts emitting from).
     *
     * For WEEKLY/BIWEEKLY rules with a [RecurrenceRule.dayOfWeek] the start is aligned forward to
     * that weekday on/after [RecurrenceRule.startDate] so the first entry lands on the preferred
     * weekday and every interval is a whole number of weeks. For positional MONTHLY rules
     * (see [RecurrenceRule.nthWeekday]) the start is the nth weekday of the start month, advanced to
     * the next eligible month when that date already precedes [RecurrenceRule.startDate]. All other
     * rules start exactly on [RecurrenceRule.startDate].
     */
    internal fun effectiveStart(rule: RecurrenceRule): LocalDate {
        val start = rule.startDate
        return when (rule.frequency) {
            RecurrenceFrequency.WEEKLY, RecurrenceFrequency.BIWEEKLY -> {
                val dow = rule.dayOfWeek ?: return start
                alignToWeekday(start, dow)
            }

            RecurrenceFrequency.MONTHLY -> {
                val dow = rule.dayOfWeek
                val nth = rule.nthWeekday
                if (dow == null || nth == null) return start
                val firstInMonth = nthWeekdayOfMonth(start.year, start.month.number, dow, nth)
                if (firstInMonth >= start) {
                    firstInMonth
                } else {
                    advanceMonthlyPositional(firstInMonth, rule.interval, dow, nth)
                }
            }

            else -> start
        }
    }

    /** Advance [date] forward (never backward) to the next occurrence of [target] weekday. */
    private fun alignToWeekday(date: LocalDate, target: DayOfWeek): LocalDate {
        val diff = ((target.ordinal - date.dayOfWeek.ordinal) + DAYS_PER_WEEK) % DAYS_PER_WEEK
        return date.plus(diff, DateTimeUnit.DAY)
    }

    private fun advanceWeekly(
        current: LocalDate,
        weeks: Int,
        preferredDay: DayOfWeek?,
    ): LocalDate {
        val advanced = current.plus(weeks, DateTimeUnit.WEEK)
        if (preferredDay == null) return advanced
        // Snap forward-only to the preferred day so an occurrence is never earlier than the
        // previous one. When [current] is already aligned (the normal case) this is a no-op.
        return alignToWeekday(advanced, preferredDay)
    }

    /**
     * Advance a positional MONTHLY recurrence by [months] months and resolve the [nth] occurrence
     * of [weekday] in the resulting month (see [RecurrenceRule.nthWeekday]).
     */
    private fun advanceMonthlyPositional(
        current: LocalDate,
        months: Int,
        weekday: DayOfWeek,
        nth: Int,
    ): LocalDate {
        val firstOfMonth = LocalDate(current.year, current.month.number, 1)
        val nextMonth = firstOfMonth.plus(months, DateTimeUnit.MONTH)
        return nthWeekdayOfMonth(nextMonth.year, nextMonth.month.number, weekday, nth)
    }

    /**
     * Resolve the [nth] occurrence of [weekday] within [year]/[month].
     *
     * `nth` in `1..4` selects the 1st–4th occurrence; `-1` (or `5`) selects the last occurrence.
     * A requested ordinal that does not exist in the month clamps to the last occurrence of
     * [weekday] (e.g. a 5th Friday in a month with only four resolves to the 4th).
     */
    internal fun nthWeekdayOfMonth(
        year: Int,
        month: Int,
        weekday: DayOfWeek,
        nth: Int,
    ): LocalDate {
        val lastDay = lastDayOfMonth(year, month)
        if (nth <= 0) {
            // Last occurrence: walk back from month end to the target weekday.
            val monthEnd = LocalDate(year, month, lastDay)
            val back = ((monthEnd.dayOfWeek.ordinal - weekday.ordinal) + DAYS_PER_WEEK) % DAYS_PER_WEEK
            return monthEnd.minus(back, DateTimeUnit.DAY)
        }
        val firstOfMonth = LocalDate(year, month, 1)
        val offset = ((weekday.ordinal - firstOfMonth.dayOfWeek.ordinal) + DAYS_PER_WEEK) % DAYS_PER_WEEK
        var day = 1 + offset + (nth - 1) * DAYS_PER_WEEK
        // Clamp a non-existent ordinal (e.g. 5th weekday) back to the last real occurrence.
        while (day > lastDay) day -= DAYS_PER_WEEK
        return LocalDate(year, month, day)
    }

    /**
     * Advance [current] by [months] months, re-anchoring on [anchorDay] (the rule's intended
     * day-of-month) and clamping to the last valid day of the resulting month.
     */
    private fun advanceMonthly(
        current: LocalDate,
        months: Int,
        anchorDay: Int,
    ): LocalDate {
        val nextMonth = current.plus(months, DateTimeUnit.MONTH)
        return clampDay(nextMonth.year, nextMonth.month.number, anchorDay)
    }

    /**
     * Advance [current] by [years] years, re-anchoring on [anchorDay] and clamping to the
     * last valid day of the resulting month (e.g. a Feb-29 anchor is restored on leap years).
     */
    private fun advanceYearly(
        current: LocalDate,
        years: Int,
        anchorDay: Int,
    ): LocalDate {
        val nextYear = current.plus(years, DateTimeUnit.YEAR)
        return clampDay(nextYear.year, nextYear.month.number, anchorDay)
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
