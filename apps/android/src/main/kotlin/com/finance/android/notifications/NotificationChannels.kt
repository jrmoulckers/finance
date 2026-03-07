package com.finance.android.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.content.getSystemService

/**
 * Notification channel definitions for the Finance app.
 *
 * Channels are created in [FinanceApplication.onCreate] so they are
 * registered before any notification is posted. Re-creating an existing
 * channel is a no-op on the system side, so this is safe to call on
 * every cold start.
 */
object NotificationChannels {

    /** High-importance alerts when a budget threshold is exceeded. */
    const val BUDGET_ALERTS_ID = "budget_alerts"
    private const val BUDGET_ALERTS_NAME = "Budget Alerts"
    private const val BUDGET_ALERTS_DESC =
        "Alerts when spending approaches or exceeds a budget threshold"

    /** Default-importance reminders for upcoming bill due dates. */
    const val BILL_REMINDERS_ID = "bill_reminders"
    private const val BILL_REMINDERS_NAME = "Bill Reminders"
    private const val BILL_REMINDERS_DESC =
        "Reminders for upcoming bill payments"

    /** Low-importance status updates for background sync operations. */
    const val SYNC_STATUS_ID = "sync_status"
    private const val SYNC_STATUS_NAME = "Sync Status"
    private const val SYNC_STATUS_DESC =
        "Status updates for background data synchronization"

    /**
     * Register all notification channels with the system.
     *
     * Must be called once during [android.app.Application.onCreate].
     * On API < 26 this is a no-op because channels are not supported.
     */
    fun createAll(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = context.getSystemService<NotificationManager>() ?: return

        val channels = listOf(
            NotificationChannel(
                BUDGET_ALERTS_ID,
                BUDGET_ALERTS_NAME,
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = BUDGET_ALERTS_DESC
                enableVibration(true)
            },
            NotificationChannel(
                BILL_REMINDERS_ID,
                BILL_REMINDERS_NAME,
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = BILL_REMINDERS_DESC
            },
            NotificationChannel(
                SYNC_STATUS_ID,
                SYNC_STATUS_NAME,
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = SYNC_STATUS_DESC
                setShowBadge(false)
            },
        )

        manager.createNotificationChannels(channels)
    }
}
