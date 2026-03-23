// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.finance.sync.SyncConfig
import com.finance.sync.SyncCredentials
import com.finance.sync.auth.TokenManager
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject
import timber.log.Timber
import java.util.concurrent.TimeUnit

/**
 * WorkManager [CoroutineWorker] for background data synchronisation.
 *
 * Runs periodically when the device has network connectivity and the
 * battery is not critically low, respecting Doze mode and battery
 * optimisation constraints. Each execution triggers a one-shot sync
 * via [AndroidSyncManager.syncNow].
 *
 * ### Scheduling
 * Call [SyncWorker.enqueuePeriodicSync] to register the periodic work request.
 * The request is "keep existing" so re-enqueuing is idempotent.
 *
 * ### Retry strategy
 * On transient failures the worker returns [Result.retry] with
 * **exponential** back-off (initial 30 s). Permanent errors (auth
 * failures, unrecoverable server errors) return [Result.failure]
 * immediately.
 *
 * ### Constraints
 * - **Network:** requires [NetworkType.CONNECTED]
 * - **Battery:** requires battery not critically low
 */
class SyncWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params), KoinComponent {

    private val syncManager: AndroidSyncManager by inject()
    private val tokenManager: TokenManager by inject()
    private val syncConfig: SyncConfig by inject()

    override suspend fun doWork(): Result {
        Timber.i("SyncWorker starting — attempt %d of %d", runAttemptCount + 1, MAX_RETRIES)

        // ── Pre-flight: valid session ───────────────────────────────────
        val session = tokenManager.retrieveTokens()
        if (session == null) {
            Timber.w("SyncWorker: no stored session — skipping sync")
            return Result.success()
        }

        val credentials = SyncCredentials(
            endpointUrl = syncConfig.endpoint,
            authToken = session.accessToken,
            userId = session.userId,
        )

        // ── Execute sync ────────────────────────────────────────────────
        return try {
            syncManager.syncNow(credentials)
            Timber.i("SyncWorker completed successfully")
            Result.success()
        } catch (e: java.net.UnknownHostException) {
            Timber.w(e, "SyncWorker: DNS resolution failed (transient)")
            retryOrFail()
        } catch (e: java.net.SocketTimeoutException) {
            Timber.w(e, "SyncWorker: connection timed out (transient)")
            retryOrFail()
        } catch (e: java.io.IOException) {
            Timber.w(e, "SyncWorker: I/O error (transient)")
            retryOrFail()
        } catch (e: IllegalStateException) {
            // Typically indicates a server-side contract violation or
            // auth token rejection — retrying is unlikely to help.
            Timber.e(e, "SyncWorker: permanent error — will not retry")
            Result.failure()
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
            Timber.e(e, "SyncWorker: unexpected error")
            retryOrFail()
        }
    }

    /**
     * Return [Result.retry] if within the retry budget, otherwise
     * [Result.failure]. Logs the decision for diagnostics.
     */
    private fun retryOrFail(): Result {
        return if (runAttemptCount < MAX_RETRIES) {
            Timber.i(
                "SyncWorker scheduling retry — attempt %d of %d",
                runAttemptCount + 1,
                MAX_RETRIES,
            )
            Result.retry()
        } else {
            Timber.e("SyncWorker exhausted %d retries — reporting failure", MAX_RETRIES)
            Result.failure()
        }
    }

    companion object {
        /** Unique work name for the periodic sync job. */
        const val WORK_NAME = "finance_periodic_sync"

        /** Maximum retry attempts before permanent failure. */
        private const val MAX_RETRIES = 5

        /** Default periodic interval in minutes. */
        private const val SYNC_INTERVAL_MINUTES = 15L

        /** Initial back-off delay in seconds for retries. */
        private const val BACKOFF_DELAY_SECONDS = 30L

        /**
         * Enqueue (or update) the periodic background sync.
         *
         * Constraints:
         * - **Network:** [NetworkType.CONNECTED] — sync only when online.
         * - **Battery:** `requiresBatteryNotLow` — skip sync when the
         *   device battery is critically low.
         * - **Back-off:** [BackoffPolicy.EXPONENTIAL] with a 30-second
         *   initial delay — retries at 30 s, 60 s, 120 s, 240 s, …
         *
         * Safe to call multiple times — existing work is kept unless
         * the constraints have changed.
         *
         * @param context Application or Activity context.
         */
        fun enqueuePeriodicSync(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .setRequiresBatteryNotLow(true)
                .build()

            val syncRequest = PeriodicWorkRequestBuilder<SyncWorker>(
                SYNC_INTERVAL_MINUTES, TimeUnit.MINUTES,
            )
                .setConstraints(constraints)
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    BACKOFF_DELAY_SECONDS, TimeUnit.SECONDS,
                )
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                syncRequest,
            )

            Timber.i(
                "Periodic sync scheduled — interval=%d min, backoff=%d s (exponential)",
                SYNC_INTERVAL_MINUTES,
                BACKOFF_DELAY_SECONDS,
            )
        }

        /**
         * Cancel the periodic background sync.
         *
         * @param context Application or Activity context.
         */
        fun cancelPeriodicSync(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
            Timber.i("Periodic sync cancelled")
        }
    }
}
