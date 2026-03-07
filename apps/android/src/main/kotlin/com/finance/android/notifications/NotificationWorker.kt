package com.finance.android.notifications

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

/**
 * [Worker] that posts a notification when its scheduled time arrives.
 *
 * Input data must contain [NotificationManager.KEY_NOTIFICATION_TYPE]
 * to determine which notification to post, plus the type-specific
 * payload keys defined in [NotificationManager.Companion].
 */
class NotificationWorker(
    context: Context,
    params: WorkerParameters,
) : Worker(context, params) {

    override fun doWork(): Result {
        val manager = NotificationManager(applicationContext)
        val type = inputData.getString(NotificationManager.KEY_NOTIFICATION_TYPE)
            ?: return Result.failure()

        return when (type) {
            NotificationManager.TYPE_BUDGET_ALERT -> {
                val budgetId = inputData.getString(NotificationManager.KEY_BUDGET_ID)
                    ?: return Result.failure()
                val message = inputData.getString(NotificationManager.KEY_MESSAGE)
                    ?: return Result.failure()
                manager.postBudgetAlert(budgetId, message)
                Result.success()
            }

            NotificationManager.TYPE_BILL_REMINDER -> {
                val billId = inputData.getString(NotificationManager.KEY_BILL_ID)
                    ?: return Result.failure()
                val dueDate = inputData.getString(NotificationManager.KEY_DUE_DATE)
                    ?: return Result.failure()
                val amount = inputData.getLong(NotificationManager.KEY_AMOUNT, 0L)
                manager.postBillReminder(billId, dueDate, amount)
                Result.success()
            }

            else -> Result.failure()
        }
    }
}
