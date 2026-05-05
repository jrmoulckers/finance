// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.recurring

import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.serialization.Serializable

/**
 * Notification preference for bill reminders.
 */
@Serializable
enum class ReminderNotificationType {
    /** Push notification. */
    PUSH,

    /** In-app notification only. */
    IN_APP,

    /** Both push and in-app. */
    BOTH,

    /** No notification (silent). */
    NONE,
}

/**
 * A bill reminder configuration tied to a [RecurringTransactionRule].
 *
 * Defines when and how the user should be notified about an upcoming bill.
 * The reminder fires at `dueDate - offsetDays` at the specified time.
 *
 * @property id Unique identifier for this reminder.
 * @property ruleId The [RecurringTransactionRule] this reminder is for.
 * @property ownerId Authenticated user who owns this reminder.
 * @property offsetDays Number of days before the due date to fire the reminder.
 *                      `0` means on the due date, `3` means 3 days before.
 * @property reminderTime Time of day to fire the reminder (hour:minute).
 * @property notificationType How to notify the user.
 * @property isEnabled Whether this reminder is active.
 * @property lastFiredDate The date this reminder last fired (for deduplication).
 */
@Serializable
data class BillReminder(
    val id: SyncId,
    val ruleId: SyncId,
    val ownerId: SyncId,
    val offsetDays: Int = 3,
    val reminderTime: ReminderTime = ReminderTime(9, 0),
    val notificationType: ReminderNotificationType = ReminderNotificationType.PUSH,
    val isEnabled: Boolean = true,
    val lastFiredDate: LocalDate? = null,
) {
    init {
        require(offsetDays >= 0) { "offsetDays must be non-negative, was $offsetDays" }
    }
}

/**
 * Time of day for a reminder, without timezone (user's local time).
 *
 * @property hour Hour in 24-hour format (0–23).
 * @property minute Minute (0–59).
 */
@Serializable
data class ReminderTime(
    val hour: Int,
    val minute: Int,
) {
    init {
        require(hour in 0..23) { "Hour must be 0–23, was $hour" }
        require(minute in 0..59) { "Minute must be 0–59, was $minute" }
    }

    /** Formatted as "HH:mm". */
    override fun toString(): String = "${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}"
}

/**
 * Calculated next reminder notification time.
 *
 * @property ruleId The recurring rule this notification is for.
 * @property reminderId The bill reminder configuration.
 * @property dueDate The bill's due date.
 * @property notificationDate The date the reminder should fire.
 * @property notificationTime The time of day for the notification.
 * @property merchant The merchant name (for notification content).
 */
@Serializable
data class ScheduledNotification(
    val ruleId: SyncId,
    val reminderId: SyncId,
    val dueDate: LocalDate,
    val notificationDate: LocalDate,
    val notificationTime: ReminderTime,
    val merchant: String,
)
