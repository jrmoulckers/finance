// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.notifications

/**
 * The three notification cadences the user can opt into.
 *
 * Each type represents a different rhythm of financial awareness:
 * - [DAILY_SNAPSHOT] — end-of-day spending summary
 * - [WEEKLY_INSIGHT] — weekly spending trends and patterns
 * - [MONTHLY_REFLECTION] — monthly financial health overview
 *
 * All notifications are **opt-in only** — nothing is enabled by default.
 * The user explicitly chooses which (if any) notifications they want.
 * There are no dark patterns to trick users into enabling notifications.
 */
enum class NotificationType(
    val displayName: String,
    val description: String,
    val channelId: String,
    val channelName: String,
) {
    DAILY_SNAPSHOT(
        displayName = "Daily snapshot",
        description = "A brief end-of-day summary of what you spent today",
        channelId = "finance_daily_snapshot",
        channelName = "Daily Snapshot",
    ),

    WEEKLY_INSIGHT(
        displayName = "Weekly insight",
        description = "A weekly look at your spending patterns and trends",
        channelId = "finance_weekly_insight",
        channelName = "Weekly Insight",
    ),

    MONTHLY_REFLECTION(
        displayName = "Monthly reflection",
        description = "A monthly overview of your financial health",
        channelId = "finance_monthly_reflection",
        channelName = "Monthly Reflection",
    ),

    /** Bill reminder notification — alerts for upcoming and overdue bills (#1125). */
    BILL_REMINDER(
        displayName = "Bill reminders",
        description = "Notifications for upcoming and overdue recurring bills",
        channelId = "finance_bill_reminder",
        channelName = "Bill Reminders",
    ),

    /** Bill overdue notification — urgent alerts for overdue bills (#1125). */
    BILL_OVERDUE(
        displayName = "Overdue bills",
        description = "Urgent notifications for bills past their due date",
        channelId = "finance_bill_overdue",
        channelName = "Overdue Bills",
    ),
}
