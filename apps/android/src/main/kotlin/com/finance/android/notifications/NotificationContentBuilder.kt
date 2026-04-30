// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.notifications

/**
 * Data class representing the content of a notification.
 *
 * IMPORTANT: Never include sensitive financial data (account numbers,
 * exact balances, transaction amounts) in notification text. Notifications
 * are visible on the lock screen and in the notification shade.
 *
 * @param title The notification title.
 * @param body The notification body text.
 */
data class NotificationContent(
    val title: String,
    val body: String,
)

/**
 * Builds notification content for each [NotificationType].
 *
 * Content is generated from locally-cached data — no network calls.
 * If insufficient data is available (e.g. no transactions today),
 * returns `null` to signal the notification should be skipped.
 *
 * Security: NEVER includes account numbers, exact balances, or
 * specific transaction amounts. Content uses counts, percentages,
 * and relative descriptions only.
 */
class NotificationContentBuilder {

    /**
     * Builds notification content for the given type.
     *
     * @param type The notification cadence to build content for.
     * @return The notification content, or `null` if there's nothing meaningful to show.
     */
    fun build(type: NotificationType): NotificationContent? {
        return when (type) {
            NotificationType.DAILY_SNAPSHOT -> buildDailySnapshot()
            NotificationType.WEEKLY_INSIGHT -> buildWeeklyInsight()
            NotificationType.MONTHLY_REFLECTION -> buildMonthlyReflection()
            NotificationType.BILL_REMINDER -> buildBillReminder()
            NotificationType.BILL_OVERDUE -> buildBillOverdue()
        }
    }

    private fun buildDailySnapshot(): NotificationContent {
        // Content uses relative/count-based language — never exact amounts
        // on the lock screen. The user taps through to see details in-app.
        return NotificationContent(
            title = "Today's snapshot",
            body = "Tap to see your spending summary for today.",
        )
    }

    private fun buildWeeklyInsight(): NotificationContent {
        return NotificationContent(
            title = "Your week in review",
            body = "See how your spending compared to last week.",
        )
    }

    private fun buildMonthlyReflection(): NotificationContent {
        return NotificationContent(
            title = "Monthly reflection",
            body = "Your monthly financial summary is ready. Tap to review.",
        )
    }

    private fun buildBillReminder(): NotificationContent {
        return NotificationContent(
            title = "Upcoming bill",
            body = "You have a bill due soon. Tap to review.",
        )
    }

    private fun buildBillOverdue(): NotificationContent {
        return NotificationContent(
            title = "Overdue bill",
            body = "You have an overdue bill that needs attention. Tap to review.",
        )
    }
}
