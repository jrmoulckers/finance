// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.notifications

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import timber.log.Timber

/**
 * UI state for the notification preferences screen/section.
 *
 * All fields default to `false` — notifications are opt-in only.
 */
data class NotificationSettingsUiState(
    val dailySnapshotEnabled: Boolean = false,
    val weeklyInsightEnabled: Boolean = false,
    val monthlyReflectionEnabled: Boolean = false,
    val billReminderEnabled: Boolean = false,
    val billOverdueEnabled: Boolean = false,
)

/**
 * ViewModel for managing notification preferences.
 *
 * Reads initial state from [NotificationPreferences] and writes changes
 * back when the user toggles a notification type. Also notifies
 * [NotificationScheduler] to sync WorkManager jobs.
 *
 * @param preferences Persistent notification preference store.
 * @param scheduler WorkManager job scheduler for notifications.
 */
class NotificationSettingsViewModel(
    private val preferences: NotificationPreferences,
    private val scheduler: NotificationScheduler,
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        NotificationSettingsUiState(
            dailySnapshotEnabled = preferences.dailySnapshotEnabled.value,
            weeklyInsightEnabled = preferences.weeklyInsightEnabled.value,
            monthlyReflectionEnabled = preferences.monthlyReflectionEnabled.value,
            billReminderEnabled = preferences.billReminderEnabled.value,
            billOverdueEnabled = preferences.billOverdueEnabled.value,
        ),
    )
    val uiState: StateFlow<NotificationSettingsUiState> = _uiState.asStateFlow()

    /**
     * Toggles a notification type on or off.
     *
     * Updates the preference, UI state, and WorkManager schedule.
     */
    fun setNotificationEnabled(type: NotificationType, enabled: Boolean) {
        preferences.setEnabled(type, enabled)

        _uiState.update { state ->
            when (type) {
                NotificationType.DAILY_SNAPSHOT ->
                    state.copy(dailySnapshotEnabled = enabled)
                NotificationType.WEEKLY_INSIGHT ->
                    state.copy(weeklyInsightEnabled = enabled)
                NotificationType.MONTHLY_REFLECTION ->
                    state.copy(monthlyReflectionEnabled = enabled)
                NotificationType.BILL_REMINDER ->
                    state.copy(billReminderEnabled = enabled)
                NotificationType.BILL_OVERDUE ->
                    state.copy(billOverdueEnabled = enabled)
            }
        }

        // Sync WorkManager schedules with new preference
        scheduler.syncSchedules()

        Timber.d("Notification %s: %s", type.name, if (enabled) "enabled" else "disabled")
    }
}
