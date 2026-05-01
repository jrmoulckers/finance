// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.sync

import android.content.Context
import android.content.SharedPreferences
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import timber.log.Timber
import java.util.concurrent.TimeUnit

/**
 * Configurable sync scheduler with user-adjustable intervals.
 *
 * Wraps [WorkManager] periodic work scheduling and exposes preference-
 * backed interval configuration. The sync interval is persisted in
 * [SharedPreferences] and survives app restarts.
 *
 * ## Default Behaviour
 * - Interval: 15 minutes (WorkManager minimum)
 * - Constraints: network connected, battery not low
 * - Backoff: exponential, 30-second initial delay
 *
 * @param context Application context for WorkManager access.
 * @param prefs SharedPreferences for interval persistence.
 */
class SyncScheduler(
    private val context: Context,
    private val prefs: SharedPreferences,
) {

    companion object {
        const val KEY_SYNC_INTERVAL = "sync_interval_minutes"
        const val KEY_SYNC_ENABLED = "sync_enabled"
        const val WORK_NAME = "finance_configurable_sync"

        /** Minimum interval supported by WorkManager. */
        const val MIN_INTERVAL_MINUTES = 15L

        /** Maximum interval to prevent stale data. */
        const val MAX_INTERVAL_MINUTES = 720L // 12 hours

        private const val BACKOFF_DELAY_SECONDS = 30L
    }

    /** Current sync interval in minutes. */
    val intervalMinutes: Long
        get() = prefs.getLong(KEY_SYNC_INTERVAL, MIN_INTERVAL_MINUTES)
            .coerceIn(MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES)

    /** Whether periodic sync is enabled. */
    val isSyncEnabled: Boolean
        get() = prefs.getBoolean(KEY_SYNC_ENABLED, true)

    /**
     * Updates the sync interval and reschedules the periodic work.
     *
     * @param minutes New interval in minutes (clamped to valid range).
     */
    fun setInterval(minutes: Long) {
        val clamped = minutes.coerceIn(MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES)
        prefs.edit().putLong(KEY_SYNC_INTERVAL, clamped).apply()
        if (isSyncEnabled) {
            schedule()
        }
        Timber.i("Sync interval updated to %d minutes", clamped)
    }

    /**
     * Enables or disables periodic background sync.
     *
     * When disabled, the existing periodic work is cancelled.
     */
    fun setSyncEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_SYNC_ENABLED, enabled).apply()
        if (enabled) {
            schedule()
        } else {
            cancel()
        }
        Timber.i("Background sync: %s", if (enabled) "enabled" else "disabled")
    }

    /**
     * Schedules periodic sync with current settings.
     *
     * Safe to call multiple times — existing work is replaced if the
     * interval has changed.
     */
    fun schedule() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .build()

        val request = PeriodicWorkRequestBuilder<SyncWorker>(
            intervalMinutes, TimeUnit.MINUTES,
        )
            .setConstraints(constraints)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                BACKOFF_DELAY_SECONDS, TimeUnit.SECONDS,
            )
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )

        Timber.i(
            "Periodic sync scheduled: interval=%d min, backoff=%d s",
            intervalMinutes,
            BACKOFF_DELAY_SECONDS,
        )
    }

    /**
     * Cancels the periodic sync work.
     */
    fun cancel() {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
        Timber.i("Periodic sync cancelled")
    }
}