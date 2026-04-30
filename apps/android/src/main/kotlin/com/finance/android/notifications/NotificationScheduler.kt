// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.notifications

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import timber.log.Timber
import java.util.concurrent.TimeUnit

/**
 * Schedules and cancels WorkManager periodic work for notification delivery.
 *
 * Each [NotificationType] maps to a separate WorkManager periodic work request
 * so they can be independently enabled/disabled based on user preference.
 *
 * WorkManager handles Doze mode, battery optimisation, and exact timing
 * constraints — we don't need AlarmManager.
 *
 * @param context Application context for WorkManager access.
 * @param preferences The user's notification opt-in preferences.
 */
class NotificationScheduler(
    private val context: Context,
    private val preferences: NotificationPreferences,
) {

    /**
     * Synchronises WorkManager jobs with the current notification preferences.
     *
     * For each [NotificationType]:
     * - If enabled → enqueue periodic work (idempotent via KEEP policy)
     * - If disabled → cancel the work
     *
     * Call this whenever a notification preference changes, and once at app startup.
     */
    fun syncSchedules() {
        NotificationType.entries.forEach { type ->
            if (preferences.isEnabled(type)) {
                enqueue(type)
            } else {
                cancel(type)
            }
        }
    }

    /**
     * Enqueues a periodic work request for the given notification type.
     *
     * Uses [ExistingPeriodicWorkPolicy.KEEP] so re-enqueuing is idempotent.
     */
    private fun enqueue(type: NotificationType) {
        val (interval, unit) = intervalFor(type)

        val request = PeriodicWorkRequestBuilder<NotificationWorker>(
            interval, unit,
        )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .addTag(type.channelId)
            .setInputData(
                androidx.work.workDataOf(
                    NotificationWorker.KEY_NOTIFICATION_TYPE to type.name,
                ),
            )
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            workNameFor(type),
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )

        Timber.d("Notification scheduled: %s (interval=%d %s)", type.name, interval, unit)
    }

    /**
     * Cancels the periodic work request for the given notification type.
     */
    private fun cancel(type: NotificationType) {
        WorkManager.getInstance(context).cancelUniqueWork(workNameFor(type))
        Timber.d("Notification cancelled: %s", type.name)
    }

    private fun intervalFor(type: NotificationType): Pair<Long, TimeUnit> = when (type) {
        NotificationType.DAILY_SNAPSHOT -> 24L to TimeUnit.HOURS
        NotificationType.WEEKLY_INSIGHT -> 7L * 24 to TimeUnit.HOURS
        NotificationType.MONTHLY_REFLECTION -> 30L * 24 to TimeUnit.HOURS
        NotificationType.BILL_REMINDER -> 24L to TimeUnit.HOURS
        NotificationType.BILL_OVERDUE -> 12L to TimeUnit.HOURS
    }

    internal companion object {
        fun workNameFor(type: NotificationType): String =
            "finance_notification_${type.name.lowercase()}"
    }
}
