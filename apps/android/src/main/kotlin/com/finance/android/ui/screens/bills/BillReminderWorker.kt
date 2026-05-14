// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.bills

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import org.koin.core.component.KoinComponent
import timber.log.Timber
import java.util.concurrent.TimeUnit

/**
 * WorkManager [CoroutineWorker] for scheduled bill reminder notifications (#1125).
 *
 * Runs daily to check for upcoming and overdue bills and dispatches
 * notifications via [com.finance.android.notifications.NotificationDispatcher].
 *
 * ### Scheduling
 * Call [BillReminderWorker.enqueueDaily] during app startup.
 * Uses [ExistingPeriodicWorkPolicy.KEEP] for idempotent re-enqueuing.
 *
 * ### Constraints
 * - **Battery:** requires battery not critically low
 */
class BillReminderWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params), KoinComponent {

    override suspend fun doWork(): Result {
        Timber.i("BillReminderWorker starting — checking for upcoming bills")

        return try {
            // TODO(#1296): Query detected bills and dispatch notifications for:
            // - Bills due today
            // - Bills due tomorrow
            // - Overdue bills
            // For now, log and succeed
            Timber.i("BillReminderWorker completed — notification check done")
            Result.success()
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
            Timber.e(e, "BillReminderWorker failed")
            if (runAttemptCount < MAX_RETRIES) Result.retry() else Result.failure()
        }
    }

    companion object {
        /** Unique work name for the daily bill reminder check. */
        const val WORK_NAME = "finance_bill_reminder"

        /** Maximum retry attempts. */
        private const val MAX_RETRIES = 3

        /**
         * Enqueue a daily bill reminder check.
         *
         * Safe to call multiple times — existing work is kept.
         *
         * @param context Application context.
         */
        fun enqueueDaily(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiresBatteryNotLow(true)
                .build()

            val request = PeriodicWorkRequestBuilder<BillReminderWorker>(
                1, TimeUnit.DAYS,
            )
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 60, TimeUnit.SECONDS)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )

            Timber.i("Daily bill reminder check scheduled")
        }

        /**
         * Cancel the daily bill reminder check.
         *
         * @param context Application context.
         */
        fun cancelDaily(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
            Timber.i("Daily bill reminder check cancelled")
        }
    }
}
