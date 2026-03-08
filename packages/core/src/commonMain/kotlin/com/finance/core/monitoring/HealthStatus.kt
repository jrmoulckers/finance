package com.finance.core.monitoring

import kotlinx.datetime.Instant

/**
 * Represents the overall health of the sync subsystem.
 *
 * Health is determined by evaluating sync recency, failure count,
 * and pending mutation queue depth. Platform layers can map these
 * states to user-facing indicators (e.g., status icons, banners).
 */
sealed class HealthStatus {

    /** Sync is operating normally with no issues detected. */
    data object Healthy : HealthStatus()

    /**
     * Sync is functional but showing signs of stress.
     *
     * @property reason Human-readable description of the degradation cause.
     */
    data class Degraded(val reason: String) : HealthStatus()

    /**
     * Sync is non-functional or critically impaired.
     *
     * @property reason Human-readable description of the failure cause.
     */
    data class Unhealthy(val reason: String) : HealthStatus()

    companion object {
        /** Maximum age of last sync before status degrades (5 minutes). */
        internal const val DEGRADED_SYNC_AGE_MS: Long = 5 * 60 * 1000L

        /** Maximum age of last sync before status becomes unhealthy (30 minutes). */
        internal const val UNHEALTHY_SYNC_AGE_MS: Long = 30 * 60 * 1000L

        /** Pending mutation count threshold for degraded status. */
        internal const val DEGRADED_PENDING_THRESHOLD: Int = 50

        /** Pending mutation count threshold for unhealthy status. */
        internal const val UNHEALTHY_PENDING_THRESHOLD: Int = 200

        /** Consecutive failure count threshold for degraded status. */
        internal const val DEGRADED_FAILURE_THRESHOLD: Int = 1

        /** Consecutive failure count threshold for unhealthy status. */
        internal const val UNHEALTHY_FAILURE_THRESHOLD: Int = 3

        /**
         * Evaluate sync health from current metrics.
         *
         * @param lastSyncTime Timestamp of the last successful sync, or null if never synced.
         * @param currentTime Current timestamp for age calculation.
         * @param failureCount Number of consecutive sync failures.
         * @param pendingMutations Number of unsynced local mutations.
         * @return The computed [HealthStatus].
         */
        fun evaluate(
            lastSyncTime: Instant?,
            currentTime: Instant,
            failureCount: Int,
            pendingMutations: Int,
        ): HealthStatus {
            if (lastSyncTime == null) {
                return Unhealthy("No successful sync recorded")
            }

            val syncAgeMs = (currentTime - lastSyncTime).inWholeMilliseconds

            // Check unhealthy conditions first (most severe)
            if (syncAgeMs > UNHEALTHY_SYNC_AGE_MS) {
                return Unhealthy("Last sync was over 30 minutes ago")
            }
            if (failureCount > UNHEALTHY_FAILURE_THRESHOLD) {
                return Unhealthy("$failureCount consecutive sync failures")
            }
            if (pendingMutations > UNHEALTHY_PENDING_THRESHOLD) {
                return Unhealthy("$pendingMutations mutations pending sync")
            }

            // Check degraded conditions
            if (syncAgeMs > DEGRADED_SYNC_AGE_MS) {
                return Degraded("Last sync was over 5 minutes ago")
            }
            if (failureCount >= DEGRADED_FAILURE_THRESHOLD) {
                return Degraded("$failureCount consecutive sync failure(s)")
            }
            if (pendingMutations >= DEGRADED_PENDING_THRESHOLD) {
                return Degraded("$pendingMutations mutations pending sync")
            }

            return Healthy
        }
    }
}
