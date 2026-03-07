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
 * @property dayOfWeek Optional day-of-week for WEEKLY/BIWEEKLY recurrences.
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
) {
    init {
        require(interval >= 1) { "Interval must be at least 1, was $interval" }
        if (dayOfMonth != null) {
            require(dayOfMonth in 1..31) { "dayOfMonth must be 1–31, was $dayOfMonth" }
        }
        if (endDate != null) {
            require(endDate >= startDate) { "endDate ($endDate) must be on or after startDate ($startDate)" }
        }
    }
}
