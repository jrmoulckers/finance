// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.sync

import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import com.finance.android.notifications.NotificationType
import timber.log.Timber

/**
 * Manages sync status notifications.
 *
 * Shows/updates/dismisses a persistent notification during background
 * sync operations. The notification is low-priority and silent to
 * avoid interrupting the user.
 *
 * ## Privacy
 * Sync notifications display only status text ("Syncing…", "Sync complete").
 * Record counts are shown but **never** financial values.
 *
 * @param context Application context.
 */
class SyncNotificationManager(private val context: Context) {

    private val notificationManager: NotificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    /**
     * Shows a "syncing in progress" notification.
     *
     * @param pendingCount Number of pending changes to sync.
     */
    fun showSyncInProgress(pendingCount: Int) {
        val notification = NotificationCompat.Builder(
            context,
            NotificationType.SYNC_STATUS.channelId,
        )
            .setSmallIcon(android.R.drawable.ic_popup_sync)
            .setContentTitle("Syncing")
            .setContentText("Syncing $pendingCount change(s)…")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setSilent(true)
            .setProgress(pendingCount, 0, true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()

        notificationManager.notify(SYNC_NOTIFICATION_ID, notification)
        Timber.d("Sync notification: in progress (%d pending)", pendingCount)
    }

    /**
     * Updates the sync notification with progress.
     *
     * @param syncedCount Number of changes synced so far.
     * @param totalCount Total number of changes.
     */
    fun updateSyncProgress(syncedCount: Int, totalCount: Int) {
        val notification = NotificationCompat.Builder(
            context,
            NotificationType.SYNC_STATUS.channelId,
        )
            .setSmallIcon(android.R.drawable.ic_popup_sync)
            .setContentTitle("Syncing")
            .setContentText("$syncedCount / $totalCount synced")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setSilent(true)
            .setProgress(totalCount, syncedCount, false)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()

        notificationManager.notify(SYNC_NOTIFICATION_ID, notification)
    }

    /**
     * Shows a "sync complete" notification and auto-dismisses after delay.
     *
     * @param syncedCount Number of records synced.
     */
    fun showSyncComplete(syncedCount: Int) {
        val notification = NotificationCompat.Builder(
            context,
            NotificationType.SYNC_STATUS.channelId,
        )
            .setSmallIcon(android.R.drawable.ic_popup_sync)
            .setContentTitle("Sync Complete")
            .setContentText("$syncedCount change(s) synced")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setAutoCancel(true)
            .setSilent(true)
            .setTimeoutAfter(DISMISS_DELAY_MS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()

        notificationManager.notify(SYNC_NOTIFICATION_ID, notification)
        Timber.d("Sync notification: complete (%d synced)", syncedCount)
    }

    /**
     * Shows a sync error notification.
     *
     * @param message Brief error description (no sensitive data).
     */
    fun showSyncError(message: String) {
        val notification = NotificationCompat.Builder(
            context,
            NotificationType.SYNC_STATUS.channelId,
        )
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("Sync Failed")
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()

        notificationManager.notify(SYNC_NOTIFICATION_ID, notification)
        Timber.w("Sync notification: error — %s", message)
    }

    /**
     * Dismisses the sync notification.
     */
    fun dismiss() {
        notificationManager.cancel(SYNC_NOTIFICATION_ID)
    }

    companion object {
        private const val SYNC_NOTIFICATION_ID = 3001
        private const val DISMISS_DELAY_MS = 5000L
    }
}