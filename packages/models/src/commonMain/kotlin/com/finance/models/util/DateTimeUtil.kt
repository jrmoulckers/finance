// SPDX-License-Identifier: BUSL-1.1

package com.finance.models.util

import kotlinx.datetime.*

/**
 * Cross-platform date/time helpers built on kotlinx-datetime.
 * No java.time usage — safe for all KMP targets.
 */
object DateTimeUtil {
    /** Returns the current [Instant] from the system clock. */
    fun now(): Instant = Clock.System.now()

    /** Returns today's [LocalDate] in the system's default time zone. */
    fun today(): LocalDate = now().toLocalDate(TimeZone.currentSystemDefault())

    /** Converts an [Instant] to a [LocalDate] in the given time zone. */
    fun Instant.toLocalDate(tz: TimeZone = TimeZone.currentSystemDefault()): LocalDate =
        this.toLocalDateTime(tz).date

    /** Returns the first day of this date's month. */
    fun LocalDate.startOfMonth(): LocalDate = LocalDate(year, month, 1)

    /** Returns the last day of this date's month. */
    fun LocalDate.endOfMonth(): LocalDate {
        val nextMonth = if (month == Month.DECEMBER) {
            LocalDate(year + 1, Month.JANUARY, 1)
        } else {
            LocalDate(year, Month.entries[month.ordinal + 1], 1)
        }
        return nextMonth.minus(1, DateTimeUnit.DAY)
    }

    /** Returns the Monday that starts this date's ISO week. */
    fun LocalDate.startOfWeek(): LocalDate {
        val daysFromMonday = dayOfWeek.isoDayNumber - 1
        return this.minus(daysFromMonday, DateTimeUnit.DAY)
    }

    /** ISO 8601 string representation of a [LocalDate]. */
    fun LocalDate.toIsoString(): String = this.toString()

    /** ISO 8601 string representation of an [Instant]. */
    fun Instant.toIsoString(): String = this.toString()
}
