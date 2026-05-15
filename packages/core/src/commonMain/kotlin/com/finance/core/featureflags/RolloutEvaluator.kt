// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.featureflags

/**
 * Deterministic rollout-percentage evaluator.
 *
 * Given a user ID and a flag key, computes a stable bucket in [0, 100) using a
 * simple hash. The result is deterministic — the same (userId, flagKey) pair always
 * produces the same bucket, ensuring consistent feature exposure without randomness.
 *
 * This approach avoids external dependencies and runs identically on all KMP targets.
 */
object RolloutEvaluator {

    /**
     * Determine whether a user falls within the rollout percentage for a flag.
     *
     * @param userId The authenticated user's identifier.
     * @param flagKey The feature flag's unique key.
     * @param rolloutPercentage The percentage of users who should see this flag (0-100).
     * @return `true` if the user's deterministic bucket is below [rolloutPercentage].
     */
    fun isInRollout(userId: String, flagKey: String, rolloutPercentage: Int): Boolean {
        require(rolloutPercentage in 0..100) {
            "rolloutPercentage must be 0-100, was $rolloutPercentage"
        }
        if (rolloutPercentage == 0) return false
        if (rolloutPercentage == 100) return true

        val bucket = computeBucket(userId, flagKey)
        return bucket < rolloutPercentage
    }

    /**
     * Compute a deterministic bucket in [0, 100) for the given (userId, flagKey) pair.
     *
     * Uses a simple FNV-1a-inspired hash to produce a uniform distribution.
     * The hash is platform-agnostic — no `java.*` APIs.
     *
     * @return An integer in [0, 100).
     */
    fun computeBucket(userId: String, flagKey: String): Int {
        val input = "$userId:$flagKey"
        var hash = OFFSET_BASIS
        for (char in input) {
            hash = hash xor char.code.toLong()
            hash *= FNV_PRIME
        }
        // Ensure non-negative modulo.
        return ((hash % BUCKET_COUNT + BUCKET_COUNT) % BUCKET_COUNT).toInt()
    }

    // FNV-1a 64-bit constants (truncated to Long).
    private const val OFFSET_BASIS = -3750763034362895579L // 0xcbf29ce484222325
    private const val FNV_PRIME = 1099511628211L // 0x100000001b3
    private const val BUCKET_COUNT = 100L
}
