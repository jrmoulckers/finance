// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.notifications

import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import timber.log.Timber

/**
 * Manages the user's notification opt-in preferences.
 *
 * All notification types are **off by default** — nothing is enabled
 * unless the user explicitly opts in. Preferences are persisted in
 * [SharedPreferences] and exposed as reactive [StateFlow]s for UI observation.
 *
 * This class does NOT send notifications itself; it only tracks which
 * types the user has opted into. [NotificationScheduler] reads these
 * preferences to schedule or cancel WorkManager jobs accordingly.
 *
 * @param prefs The app's [SharedPreferences] instance.
 */
class NotificationPreferences(private val prefs: SharedPreferences) {

    private val _dailySnapshotEnabled = MutableStateFlow(
        prefs.getBoolean(KEY_DAILY_SNAPSHOT, false),
    )
    val dailySnapshotEnabled: StateFlow<Boolean> = _dailySnapshotEnabled.asStateFlow()

    private val _weeklyInsightEnabled = MutableStateFlow(
        prefs.getBoolean(KEY_WEEKLY_INSIGHT, false),
    )
    val weeklyInsightEnabled: StateFlow<Boolean> = _weeklyInsightEnabled.asStateFlow()

    private val _monthlyReflectionEnabled = MutableStateFlow(
        prefs.getBoolean(KEY_MONTHLY_REFLECTION, false),
    )
    val monthlyReflectionEnabled: StateFlow<Boolean> = _monthlyReflectionEnabled.asStateFlow()

    private val _billReminderEnabled = MutableStateFlow(
        prefs.getBoolean(KEY_BILL_REMINDER, false),
    )
    val billReminderEnabled: StateFlow<Boolean> = _billReminderEnabled.asStateFlow()

    private val _billOverdueEnabled = MutableStateFlow(
        prefs.getBoolean(KEY_BILL_OVERDUE, false),
    )
    val billOverdueEnabled: StateFlow<Boolean> = _billOverdueEnabled.asStateFlow()

    /**
     * Checks whether a specific notification type is enabled.
     */
    fun isEnabled(type: NotificationType): Boolean = when (type) {
        NotificationType.DAILY_SNAPSHOT -> _dailySnapshotEnabled.value
        NotificationType.WEEKLY_INSIGHT -> _weeklyInsightEnabled.value
        NotificationType.MONTHLY_REFLECTION -> _monthlyReflectionEnabled.value
        NotificationType.BILL_REMINDER -> _billReminderEnabled.value
        NotificationType.BILL_OVERDUE -> _billOverdueEnabled.value
        NotificationType.SYNC_STATUS -> true // Sync status is always enabled when syncing
    }

    /**
     * Sets the enabled state for a notification type.
     *
     * Persists to [SharedPreferences] and updates the reactive [StateFlow]
     * so all observers (UI + scheduler) update immediately.
     *
     * @param type The notification type to toggle.
     * @param enabled Whether to enable or disable the notification.
     */
    fun setEnabled(type: NotificationType, enabled: Boolean) {
        val key = keyFor(type)
        prefs.edit().putBoolean(key, enabled).apply()

        when (type) {
            NotificationType.DAILY_SNAPSHOT -> _dailySnapshotEnabled.value = enabled
            NotificationType.WEEKLY_INSIGHT -> _weeklyInsightEnabled.value = enabled
            NotificationType.MONTHLY_REFLECTION -> _monthlyReflectionEnabled.value = enabled
            NotificationType.BILL_REMINDER -> _billReminderEnabled.value = enabled
            NotificationType.BILL_OVERDUE -> _billOverdueEnabled.value = enabled
            NotificationType.SYNC_STATUS -> { /* Sync status is not user-togglable */ }
        }

        Timber.d("Notification preference updated: %s = %s", type.name, enabled)
    }

    private fun keyFor(type: NotificationType): String = when (type) {
        NotificationType.DAILY_SNAPSHOT -> KEY_DAILY_SNAPSHOT
        NotificationType.WEEKLY_INSIGHT -> KEY_WEEKLY_INSIGHT
        NotificationType.MONTHLY_REFLECTION -> KEY_MONTHLY_REFLECTION
        NotificationType.BILL_REMINDER -> KEY_BILL_REMINDER
        NotificationType.BILL_OVERDUE -> KEY_BILL_OVERDUE
        NotificationType.SYNC_STATUS -> KEY_SYNC_STATUS
    }

    internal companion object {
        const val KEY_DAILY_SNAPSHOT = "notification_daily_snapshot"
        const val KEY_WEEKLY_INSIGHT = "notification_weekly_insight"
        const val KEY_MONTHLY_REFLECTION = "notification_monthly_reflection"
        const val KEY_BILL_REMINDER = "notification_bill_reminder"
        const val KEY_BILL_OVERDUE = "notification_bill_overdue"
        const val KEY_SYNC_STATUS = "notification_sync_status"
    }
}
