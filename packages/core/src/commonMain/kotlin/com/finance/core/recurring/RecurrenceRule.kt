// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.recurring

import com.finance.models.types.SyncId
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlinx.serialization.Serializable

/**
 * Supported recurrence frequencies for recurring transactions and bill schedules.
 */
@Serializable
enum class RecurrenceFrequency {
    DAILY,
    WEEKLY,
    BIWEEKLY,
    MONTHLY,
    YEARLY,
}

/**
 * Defines when and how often a recurring transaction repeats.
 *
 * @property id Unique identifier for this rule.
 * @property frequency How often the recurrence repeats.
 * @property interval Every Nth frequency unit (e.g., interval=2 + WEEKLY = every 2 weeks).
 * @property startDate The first occurrence date.
 * @property endDate Optional end boundary; no occurrences generated after this date.
 * @property dayOfMonth Optional day-of-month override for MONTHLY/YEARLY (1–31).
 *   Clamped to the last day of shorter months (e.g., 31 → 28 for Feb in non-leap years).
 *   When `null`, the day-of-month of [startDate] is used as the recurrence anchor and is
 *   preserved across short months (e.g., a Jan-31 anchor still lands on Mar 31, not Mar 28).
 * @property dayOfWeek Optional day-of-week for WEEKLY/BIWEEKLY recurrences, and the target
 *   weekday for positional MONTHLY recurrences (see [nthWeekday]). For WEEKLY/BIWEEKLY rules the
 *   first emitted occurrence is aligned to this weekday on/after [startDate], and every subsequent
 *   occurrence stays on this weekday exactly `interval` (×2 for biweekly) weeks apart.
 * @property nthWeekday Optional RRULE `BYDAY`-style positional weekday selector for MONTHLY rules.
 *   Combined with [dayOfWeek] it selects the *nth* weekday of each month: `1`..`4` pick the
 *   1st–4th occurrence of [dayOfWeek]; `-1` (or `5`) picks the **last** occurrence. A requested
 *   ordinal that does not exist in a given month (e.g. a 5th Friday) gracefully clamps to the last
 *   occurrence of that weekday in the month. Requires [dayOfWeek] to be non-null and only applies
 *   when [frequency] is [RecurrenceFrequency.MONTHLY]. When set, [dayOfMonth] is ignored.
 * @property count Optional RRULE-style occurrence cap: generate at most this many occurrences
 *   counting from [startDate] (inclusive). `null` means unbounded (subject to [endDate]).
 *   When both [count] and [endDate] are set, whichever limit is reached first wins.
 * @property skipDates Occurrence dates to omit from generation (RRULE `EXDATE` semantics).
 *   A skipped occurrence still consumes its slot for [count] purposes and does not shift the
 *   cadence of later occurrences.
 * @property isPaused When `true`, the rule is temporarily suspended and generates no
 *   occurrences until re-enabled. The underlying schedule definition is preserved.
 */
@Serializable
data class RecurrenceRule(
    val id: SyncId,
    val frequency: RecurrenceFrequency,
    val interval: Int = 1,
    val startDate: LocalDate,
    val endDate: LocalDate? = null,
    val dayOfMonth: Int? = null,
    val dayOfWeek: DayOfWeek? = null,
    val nthWeekday: Int? = null,
    val count: Int? = null,
    val skipDates: Set<LocalDate> = emptySet(),
    val isPaused: Boolean = false,
) {
    init {
        require(interval >= 1) { "Interval must be at least 1, was $interval" }
        if (dayOfMonth != null) {
            require(dayOfMonth in 1..31) { "dayOfMonth must be 1–31, was $dayOfMonth" }
        }
        if (nthWeekday != null) {
            require(nthWeekday in 1..5 || nthWeekday == -1) {
                "nthWeekday must be 1..5 or -1 (last), was $nthWeekday"
            }
            require(dayOfWeek != null) {
                "nthWeekday positional recurrence requires a dayOfWeek"
            }
        }
        if (endDate != null) {
            require(endDate >= startDate) { "endDate ($endDate) must be on or after startDate ($startDate)" }
        }
        if (count != null) {
            require(count >= 1) { "count must be at least 1 when set, was $count" }
        }
    }
}
