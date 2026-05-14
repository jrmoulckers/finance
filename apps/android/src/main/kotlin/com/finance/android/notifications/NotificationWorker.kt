// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.notifications

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject
import timber.log.Timber

/**
 * WorkManager [CoroutineWorker] that delivers a single notification.
 *
 * Each invocation reads the [KEY_NOTIFICATION_TYPE] from input data,
 * generates the appropriate notification content via [NotificationContentBuilder],
 * and delegates to [NotificationDispatcher] to display it.
 *
 * The worker is lightweight — it does NOT fetch network data. All content
 * is generated from locally-cached repository data. If no data is available,
 * the notification is silently skipped (no error).
 */
class NotificationWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params), KoinComponent {

    private val contentBuilder: NotificationContentBuilder by inject()
    private val dispatcher: NotificationDispatcher by inject()
    private val preferences: NotificationPreferences by inject()

    @Suppress("ReturnCount") // Multiple early returns improve readability
    override suspend fun doWork(): Result {
        val typeName = inputData.getString(KEY_NOTIFICATION_TYPE)
        if (typeName == null) {
            Timber.w("NotificationWorker: missing notification type in input data")
            return Result.failure()
        }

        val type = try {
            NotificationType.valueOf(typeName)
        } catch (_: IllegalArgumentException) {
            Timber.w("NotificationWorker: unknown notification type '%s'", typeName)
            return Result.failure()
        }

        // Re-check preference — the user may have disabled it since scheduling.
        if (!preferences.isEnabled(type)) {
            Timber.d("NotificationWorker: %s is disabled — skipping", type.name)
            return Result.success()
        }

        return try {
            val content = contentBuilder.build(type)
            if (content != null) {
                dispatcher.show(type, content)
                Timber.d("NotificationWorker: delivered %s notification", type.name)
            } else {
                Timber.d("NotificationWorker: no content for %s — skipping", type.name)
            }
            Result.success()
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
            Timber.e(e, "NotificationWorker: failed to deliver %s", type.name)
            Result.retry()
        }
    }

    companion object {
        /** Input data key for the [NotificationType] name. */
        const val KEY_NOTIFICATION_TYPE = "notification_type"
    }
}
