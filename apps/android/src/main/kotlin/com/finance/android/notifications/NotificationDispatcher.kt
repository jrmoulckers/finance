// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.notifications

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.finance.android.MainActivity
import timber.log.Timber

/**
 * Dispatches Android system notifications.
 *
 * Handles POST_NOTIFICATIONS permission checking (Android 13+),
 * notification building with Material styling, and PendingIntent
 * creation for tap-through navigation.
 *
 * @param context Application context.
 */
class NotificationDispatcher(private val context: Context) {

    /**
     * Shows a notification for the given type and content.
     *
     * On Android 13+ (API 33), checks POST_NOTIFICATIONS permission
     * before attempting to show. If permission is not granted, the
     * notification is silently skipped (no crash, no error).
     *
     * @param type The notification type (determines channel and ID).
     * @param content The title and body text.
     */
    fun show(type: NotificationType, content: NotificationContent) {
        if (!hasNotificationPermission()) {
            Timber.d("POST_NOTIFICATIONS permission not granted — skipping %s", type.name)
            return
        }

        val notification = NotificationCompat.Builder(context, type.channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(content.title)
            .setContentText(content.body)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(createPendingIntent())
            .build()

        try {
            NotificationManagerCompat.from(context).notify(
                notificationIdFor(type),
                notification,
            )
        } catch (e: SecurityException) {
            Timber.w(e, "SecurityException showing notification — permission may have been revoked")
        }
    }

    private fun hasNotificationPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true // Pre-Android 13: permission not required
        }
    }

    private fun createPendingIntent(): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        return PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun notificationIdFor(type: NotificationType): Int = when (type) {
        NotificationType.DAILY_SNAPSHOT -> NOTIFICATION_ID_DAILY
        NotificationType.WEEKLY_INSIGHT -> NOTIFICATION_ID_WEEKLY
        NotificationType.MONTHLY_REFLECTION -> NOTIFICATION_ID_MONTHLY
        NotificationType.BILL_REMINDER -> NOTIFICATION_ID_BILL_REMINDER
        NotificationType.BILL_OVERDUE -> NOTIFICATION_ID_BILL_OVERDUE
    }

    internal companion object {
        const val NOTIFICATION_ID_DAILY = 1001
        const val NOTIFICATION_ID_WEEKLY = 1002
        const val NOTIFICATION_ID_MONTHLY = 1003
        const val NOTIFICATION_ID_BILL_REMINDER = 1004
        const val NOTIFICATION_ID_BILL_OVERDUE = 1005
    }
}
