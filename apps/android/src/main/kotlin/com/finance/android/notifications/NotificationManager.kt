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
import androidx.work.Data
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.finance.android.MainActivity
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.util.concurrent.TimeUnit

/**
 * Schedules and posts local notifications for budget alerts, bill
 * reminders, and other finance-related events.
 *
 * All scheduled work uses [WorkManager] so that notifications survive
 * process death and respect Doze-mode constraints.
 *
 * @param context Application or Activity context.
 */
class NotificationManager(private val context: Context) {

    private val workManager: WorkManager = WorkManager.getInstance(context)

    // ── Budget alerts ────────────────────────────────────────────────

    /**
     * Schedule a notification that fires when a budget threshold is
     * reached.
     *
     * @param budgetId  Unique identifier for the budget.
     * @param threshold Spending threshold percentage (0.0 – 1.0).
     * @param message   Human-readable alert body.
     */
    fun scheduleBudgetAlert(
        budgetId: String,
        threshold: Double,
        message: String,
    ) {
        val data = Data.Builder()
            .putString(KEY_NOTIFICATION_TYPE, TYPE_BUDGET_ALERT)
            .putString(KEY_BUDGET_ID, budgetId)
            .putDouble(KEY_THRESHOLD, threshold)
            .putString(KEY_MESSAGE, message)
            .build()

        val request = OneTimeWorkRequestBuilder<NotificationWorker>()
            .setInputData(data)
            .addTag(tagForBudget(budgetId))
            .build()

        workManager.enqueue(request)
    }

    // ── Bill reminders ───────────────────────────────────────────────

    /**
     * Schedule a reminder notification for an upcoming bill.
     *
     * The notification is scheduled to fire at 09:00 on the day before
     * the [dueDate]. If that time has already passed, the notification
     * fires immediately.
     *
     * @param billId  Unique identifier for the bill.
     * @param dueDate Date the bill payment is due.
     * @param amount  Bill amount in cents.
     */
    fun scheduleBillReminder(
        billId: String,
        dueDate: LocalDate,
        amount: Long,
    ) {
        val reminderTime = LocalDateTime.of(dueDate.minusDays(1), LocalTime.of(9, 0))
        val delay = Duration.between(LocalDateTime.now(), reminderTime)
            .coerceAtLeast(Duration.ZERO)

        val data = Data.Builder()
            .putString(KEY_NOTIFICATION_TYPE, TYPE_BILL_REMINDER)
            .putString(KEY_BILL_ID, billId)
            .putString(KEY_DUE_DATE, dueDate.toString())
            .putLong(KEY_AMOUNT, amount)
            .build()

        val request = OneTimeWorkRequestBuilder<NotificationWorker>()
            .setInitialDelay(delay.toMillis(), TimeUnit.MILLISECONDS)
            .setInputData(data)
            .addTag(tagForBill(billId))
            .build()

        workManager.enqueue(request)
    }

    // ── Cancellation ─────────────────────────────────────────────────

    /** Cancel any pending notifications for the given budget. */
    fun cancelBudgetAlert(budgetId: String) {
        workManager.cancelAllWorkByTag(tagForBudget(budgetId))
    }

    /** Cancel any pending notifications for the given bill. */
    fun cancelBillReminder(billId: String) {
        workManager.cancelAllWorkByTag(tagForBill(billId))
    }

    // ── Immediate posting (used by NotificationWorker) ───────────────

    /**
     * Post a budget-alert notification immediately.
     *
     * Includes a "View Budget" action that deep-links to the budget
     * detail screen.
     */
    internal fun postBudgetAlert(budgetId: String, message: String) {
        if (!hasNotificationPermission()) return

        val viewIntent = Intent(context, MainActivity::class.java).apply {
            action = ACTION_VIEW_BUDGET
            putExtra(EXTRA_BUDGET_ID, budgetId)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        val viewPending = PendingIntent.getActivity(
            context,
            budgetId.hashCode(),
            viewIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, NotificationChannels.BUDGET_ALERTS_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("Budget Alert")
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(viewPending)
            .addAction(
                android.R.drawable.ic_menu_view,
                "View Budget",
                viewPending,
            )
            .build()

        NotificationManagerCompat.from(context)
            .notify(budgetId.hashCode(), notification)
    }

    /**
     * Post a bill-reminder notification immediately.
     *
     * Includes a "Mark as Paid" action.
     */
    internal fun postBillReminder(
        billId: String,
        dueDate: String,
        amount: Long,
    ) {
        if (!hasNotificationPermission()) return

        val viewIntent = Intent(context, MainActivity::class.java).apply {
            action = ACTION_VIEW_BILL
            putExtra(EXTRA_BILL_ID, billId)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val viewPending = PendingIntent.getActivity(
            context,
            billId.hashCode(),
            viewIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val markPaidIntent = Intent(context, MainActivity::class.java).apply {
            action = ACTION_MARK_PAID
            putExtra(EXTRA_BILL_ID, billId)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val markPaidPending = PendingIntent.getActivity(
            context,
            billId.hashCode() + 1,
            markPaidIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val formattedAmount = "$${amount / 100}.${"%02d".format(amount % 100)}"
        val notification = NotificationCompat.Builder(context, NotificationChannels.BILL_REMINDERS_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Bill Due: $formattedAmount")
            .setContentText("Payment due on $dueDate")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(viewPending)
            .addAction(
                android.R.drawable.ic_menu_view,
                "View Bill",
                viewPending,
            )
            .addAction(
                android.R.drawable.ic_input_add,
                "Mark as Paid",
                markPaidPending,
            )
            .build()

        NotificationManagerCompat.from(context)
            .notify(billId.hashCode(), notification)
    }

    // ── Helpers ──────────────────────────────────────────────────────

    private fun hasNotificationPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
    }

    companion object {
        // Work-tag prefixes
        private fun tagForBudget(id: String) = "budget_alert_$id"
        private fun tagForBill(id: String) = "bill_reminder_$id"

        // Intent actions
        const val ACTION_VIEW_BUDGET = "com.finance.android.ACTION_VIEW_BUDGET"
        const val ACTION_VIEW_BILL = "com.finance.android.ACTION_VIEW_BILL"
        const val ACTION_MARK_PAID = "com.finance.android.ACTION_MARK_PAID"

        // Intent extras
        const val EXTRA_BUDGET_ID = "extra_budget_id"
        const val EXTRA_BILL_ID = "extra_bill_id"

        // Worker data keys
        internal const val KEY_NOTIFICATION_TYPE = "notification_type"
        internal const val KEY_BUDGET_ID = "budget_id"
        internal const val KEY_BILL_ID = "bill_id"
        internal const val KEY_THRESHOLD = "threshold"
        internal const val KEY_MESSAGE = "message"
        internal const val KEY_DUE_DATE = "due_date"
        internal const val KEY_AMOUNT = "amount"

        // Notification types
        internal const val TYPE_BUDGET_ALERT = "budget_alert"
        internal const val TYPE_BILL_REMINDER = "bill_reminder"
    }
}
