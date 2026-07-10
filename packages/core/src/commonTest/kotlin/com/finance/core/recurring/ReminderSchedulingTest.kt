// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.recurring

import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

/** Tests for timezone/DST-aware reminder instant resolution (#3741). */
class ReminderSchedulingTest {

    private val newYork = TimeZone.of("America/New_York")

    @Test
    fun resolvesWallClockToInstantInUtc() {
        val instant = ReminderScheduling.resolveInstant(
            date = LocalDate(2024, 6, 15),
            time = ReminderTime(9, 0),
            zone = TimeZone.UTC,
        )
        assertEquals(Instant.parse("2024-06-15T09:00:00Z"), instant)
    }

    @Test
    fun sameWallClockInDifferentZonesYieldsDifferentInstants() {
        val date = LocalDate(2024, 6, 15)
        val time = ReminderTime(9, 0)

        val utc = ReminderScheduling.resolveInstant(date, time, TimeZone.UTC)
        val ny = ReminderScheduling.resolveInstant(date, time, newYork)

        assertNotEquals(utc, ny)
        // New York is UTC-4 in June (EDT), so 09:00 local is 13:00 UTC.
        assertEquals(Instant.parse("2024-06-15T13:00:00Z"), ny)
    }

    @Test
    fun springForwardGap_shiftsForwardToFirstValidInstant() {
        // 2024-03-10 02:30 does not exist in New York (clocks jump 02:00 -> 03:00).
        val instant = ReminderScheduling.resolveInstant(
            date = LocalDate(2024, 3, 10),
            time = ReminderTime(2, 30),
            zone = newYork,
        )

        // Shifted forward to 03:30 EDT (-04:00) = 07:30 UTC.
        assertEquals(Instant.parse("2024-03-10T07:30:00Z"), instant)
        val local = instant.toLocalDateTime(newYork)
        assertEquals(3, local.hour)
        assertEquals(30, local.minute)
    }

    @Test
    fun fallBackOverlap_choosesEarlierInstant() {
        // 2024-11-03 01:30 occurs twice in New York (clocks fall 02:00 -> 01:00).
        val instant = ReminderScheduling.resolveInstant(
            date = LocalDate(2024, 11, 3),
            time = ReminderTime(1, 30),
            zone = newYork,
        )

        // Earlier occurrence is EDT (-04:00) = 05:30 UTC (not the later EST 06:30 UTC).
        assertEquals(Instant.parse("2024-11-03T05:30:00Z"), instant)
    }

    @Test
    fun scheduledNotificationOverload_resolvesNotificationDateAndTime() {
        val notification = ScheduledNotification(
            ruleId = SyncId("rule-1"),
            reminderId = SyncId("rem-1"),
            dueDate = LocalDate(2024, 6, 18),
            notificationDate = LocalDate(2024, 6, 15),
            notificationTime = ReminderTime(8, 30),
            merchant = "Netflix",
        )

        val instant = ReminderScheduling.resolveInstant(notification, newYork)
        assertEquals(Instant.parse("2024-06-15T12:30:00Z"), instant) // 08:30 EDT = 12:30 UTC
    }
}
