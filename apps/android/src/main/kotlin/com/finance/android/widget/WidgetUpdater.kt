// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.widget

import android.content.Context
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.updateAll
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import timber.log.Timber

/**
 * Updates all Finance home screen widgets.
 *
 * Call this after a sync completes, a transaction is saved, or an account
 * balance changes to ensure widgets reflect the latest data.
 *
 * This is safe to call from any coroutine scope — it switches to the IO
 * dispatcher internally.
 *
 * ## Usage
 * ```kotlin
 * // After a sync completes
 * WidgetUpdater.refreshAll(context)
 * ```
 *
 * ## Integration Points
 * - [SyncWorker] calls this after a successful sync
 * - [TransactionCreateViewModel] calls this after saving a transaction
 * - [AccountCreateViewModel] calls this after adding an account
 */
object WidgetUpdater {

    /**
     * Triggers a refresh of all Finance widgets on the home screen.
     *
     * @param context Application context.
     */
    suspend fun refreshAll(context: Context) {
        withContext(Dispatchers.IO) {
            @Suppress("TooGenericExceptionCaught") // Multiple exception types possible
            try {
                BalanceSummaryWidget().updateAll(context)
                BudgetSummaryWidget().updateAll(context)
                GoalProgressWidget().updateAll(context)
                Timber.d("All finance widgets refreshed")
            } catch (e: Exception) {
                Timber.e(e, "Failed to refresh finance widgets")
            }
        }
    }

    /**
     * Checks if any Finance widgets are currently placed on the home screen.
     *
     * Useful for conditional work — skip expensive data loading if no
     * widgets are active.
     *
     * @param context Application context.
     * @return `true` if at least one Finance widget is placed.
     */
    suspend fun hasActiveWidgets(context: Context): Boolean {
        return withContext(Dispatchers.IO) {
            @Suppress("TooGenericExceptionCaught") // Multiple exception types possible
            try {
                val manager = GlanceAppWidgetManager(context)
                val balanceIds = manager.getGlanceIds(BalanceSummaryWidget::class.java)
                val quickIds = manager.getGlanceIds(QuickTransactionWidget::class.java)
                val budgetIds = manager.getGlanceIds(BudgetSummaryWidget::class.java)
                val goalIds = manager.getGlanceIds(GoalProgressWidget::class.java)
                (balanceIds.size + quickIds.size + budgetIds.size + goalIds.size) > 0
            } catch (e: Exception) {
                Timber.e(e, "Failed to check active widgets")
                false
            }
        }
    }
}
