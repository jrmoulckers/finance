// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.recurring

import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toInstant

/**
 * Resolves timezone-naive reminder data ([LocalDate] + [ReminderTime]) into an absolute [Instant]
 * anchored to a user's [TimeZone], so reminders fire at the intended civil time even across time
 * zone changes and daylight-saving-time (DST) transitions.
 *
 * `ReminderTime` carries only hour/minute and `ScheduledNotification.notificationDate` is a bare
 * `LocalDate`; without a zone a reminder like "9:00 the day before" has no real instant. This
 * object supplies that anchor.
 *
 * ## DST semantics
 * Wall-clock resolution delegates to `kotlinx-datetime`'s [LocalDateTime.toInstant] and inherits its
 * documented, deterministic behavior:
 * - **Spring-forward gap** (a wall-clock time that does not exist, e.g. 02:30 when clocks jump
 *   02:00 → 03:00): the time is shifted forward by the size of the gap, so the reminder fires at the
 *   first valid instant after the requested time rather than being dropped.
 * - **Fall-back overlap** (a wall-clock time that occurs twice, e.g. 01:30 when clocks fall
 *   03:00 → 02:00... 01:00): the **earlier** of the two instants is chosen, so the reminder fires
 *   once, at its first occurrence.
 *
 * All functions are pure `commonMain` and use no platform APIs.
 */
object ReminderScheduling {

    /**
     * Resolve a reminder [date] and wall-clock [time] in [zone] to an absolute [Instant].
     *
     * @param date The civil date the reminder should fire on.
     * @param time The wall-clock time of day (hour/minute) in [zone].
     * @param zone The user's time zone anchoring the wall-clock time.
     * @return The absolute instant the reminder should fire, applying the DST semantics above.
     */
    fun resolveInstant(date: LocalDate, time: ReminderTime, zone: TimeZone): Instant {
        val wallClock = LocalDateTime(
            year = date.year,
            monthNumber = date.monthNumber,
            dayOfMonth = date.dayOfMonth,
            hour = time.hour,
            minute = time.minute,
        )
        return wallClock.toInstant(zone)
    }

    /**
     * Resolve a computed [ScheduledNotification] to the absolute [Instant] it should fire at in
     * [zone], combining its [ScheduledNotification.notificationDate] and
     * [ScheduledNotification.notificationTime].
     *
     * @param notification The scheduled notification produced by [BillReminderEngine].
     * @param zone The user's time zone.
     * @return The absolute instant the notification should fire.
     */
    fun resolveInstant(notification: ScheduledNotification, zone: TimeZone): Instant =
        resolveInstant(notification.notificationDate, notification.notificationTime, zone)
}
