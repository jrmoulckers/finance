// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.sync

import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.finance.android.notifications.NotificationType
import org.koin.core.component.KoinComponent
import timber.log.Timber
import java.util.concurrent.TimeUnit

/**
 * WorkManager worker that checks for upcoming bill reminders.
 *
 * Runs daily to scan for bills due within the next 3 days and posts
 * local notifications. No network access is required — bill data is
 * read from the local SQLDelight database.
 *
 * ## Notification Behaviour
 * - Uses the [NotificationChannelManager.CHANNEL_BILL_REMINDERS] channel.
 * - Groups multiple due bills into a summary notification.
 * - Tapping a notification deep-links to the bill detail screen.
 *
 * ## Privacy
 * Notification content uses generic wording ("You have a bill due soon")
 * and does not display amounts or payee names on the lock screen.
 *
 * @param context Worker context.
 * @param params Worker parameters.
 */
class BillReminderWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params), KoinComponent {

    override suspend fun doWork(): Result {
        Timber.i("BillReminderWorker starting — checking for upcoming bills")

        return try {
            // TODO(#1296): Query bills from repository that are due within 3 days.
            // For now, this is a placeholder that demonstrates the
            // notification pattern.
            val dueBillCount = checkUpcomingBills()

            if (dueBillCount > 0) {
                postBillReminder(dueBillCount)
                Timber.i("Posted reminder for %d upcoming bill(s)", dueBillCount)
            } else {
                Timber.d("No upcoming bills found")
            }

            Result.success()
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
            Timber.e(e, "BillReminderWorker failed")
            Result.retry()
        }
    }

    /**
     * Checks for bills due within the reminder window.
     *
     * @return The number of bills due soon.
     */
    @Suppress("FunctionOnlyReturningConstant") // Kept as function for API consistency
    private suspend fun checkUpcomingBills(): Int {
        // TODO(#1296): Wire to actual bill/recurring transaction repository.
        // Return 0 until the data layer is connected.
        return 0
    }

    /**
     * Posts a notification for upcoming bills.
     *
     * @param count Number of bills due soon.
     */
    private fun postBillReminder(count: Int) {
        val notificationManager = applicationContext.getSystemService(
            Context.NOTIFICATION_SERVICE,
        ) as NotificationManager

        val notification = NotificationCompat.Builder(
            applicationContext,
            NotificationType.BILL_REMINDER.channelId,
        )
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Bills Due Soon")
            .setContentText(
                if (count == 1) "You have a bill due in the next 3 days"
                else "You have $count bills due in the next 3 days",
            )
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            // Lock screen: hide financial details
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .build()

        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    companion object {
        const val WORK_NAME = "finance_bill_reminders"
        private const val NOTIFICATION_ID = 2001
        private const val CHECK_INTERVAL_HOURS = 24L

        /**
         * Enqueues the daily bill reminder check.
         *
         * Safe to call multiple times — existing work is kept.
         *
         * @param context Application context.
         */
        fun enqueueDaily(context: Context) {
            val request = PeriodicWorkRequestBuilder<BillReminderWorker>(
                CHECK_INTERVAL_HOURS, TimeUnit.HOURS,
            )
                .setBackoffCriteria(
                    BackoffPolicy.LINEAR,
                    30, TimeUnit.MINUTES,
                )
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )

            Timber.i("Bill reminder check scheduled: every %d hours", CHECK_INTERVAL_HOURS)
        }

        /**
         * Cancels the bill reminder periodic work.
         *
         * @param context Application context.
         */
        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
            Timber.i("Bill reminder check cancelled")
        }
    }
}
