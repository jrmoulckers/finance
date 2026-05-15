// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.featureflags

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class RolloutEvaluatorTest {

    // ═══════════════════════════════════════════════════════════════════
    // Boundary cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun zeroPercentage_alwaysFalse() {
        assertFalse(RolloutEvaluator.isInRollout("user-1", "flag.test", 0))
        assertFalse(RolloutEvaluator.isInRollout("user-999", "flag.test", 0))
    }

    @Test
    fun hundredPercentage_alwaysTrue() {
        assertTrue(RolloutEvaluator.isInRollout("user-1", "flag.test", 100))
        assertTrue(RolloutEvaluator.isInRollout("user-999", "flag.test", 100))
    }

    @Test
    fun invalidPercentage_throws() {
        assertFailsWith<IllegalArgumentException> {
            RolloutEvaluator.isInRollout("user-1", "flag.test", -1)
        }
        assertFailsWith<IllegalArgumentException> {
            RolloutEvaluator.isInRollout("user-1", "flag.test", 101)
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Determinism
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun sameInputs_produceSameResult() {
        val result1 = RolloutEvaluator.isInRollout("user-42", "feature.alpha", 50)
        val result2 = RolloutEvaluator.isInRollout("user-42", "feature.alpha", 50)
        assertEquals(result1, result2, "Same inputs must produce same result")
    }

    @Test
    fun sameUser_differentFlags_producesValidBuckets() {
        val bucket1 = RolloutEvaluator.computeBucket("user-42", "flag.a")
        val bucket2 = RolloutEvaluator.computeBucket("user-42", "flag.b")
        assertTrue(bucket1 in 0 until 100)
        assertTrue(bucket2 in 0 until 100)
    }

    @Test
    fun differentUsers_sameFlag_producesValidBuckets() {
        val bucket1 = RolloutEvaluator.computeBucket("user-1", "flag.test")
        val bucket2 = RolloutEvaluator.computeBucket("user-2", "flag.test")
        assertTrue(bucket1 in 0 until 100)
        assertTrue(bucket2 in 0 until 100)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Bucket distribution
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun computeBucket_returnsValueInRange() {
        for (i in 0 until 200) {
            val bucket = RolloutEvaluator.computeBucket("user-$i", "test.flag")
            assertTrue(bucket in 0 until 100, "Bucket $bucket out of range for user-$i")
        }
    }

    @Test
    fun rollout50_roughlyHalfIncluded() {
        val totalUsers = 1000
        val included = (0 until totalUsers).count { i ->
            RolloutEvaluator.isInRollout("user-$i", "flag.fifty", 50)
        }
        // With 1000 users and 50% rollout, expect roughly 500 +/- reasonable margin.
        assertTrue(included in 350..650, "Expected ~500 users, got $included")
    }

    @Test
    fun rollout10_roughlyTenPercentIncluded() {
        val totalUsers = 1000
        val included = (0 until totalUsers).count { i ->
            RolloutEvaluator.isInRollout("user-$i", "flag.ten", 10)
        }
        assertTrue(included in 30..200, "Expected ~100 users, got $included")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Monotonicity — increasing percentage should include more users
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun higherPercentage_includesSuperset() {
        val userId = "user-monotone"
        val flagKey = "flag.test"

        // Find the bucket for this user/flag pair.
        val bucket = RolloutEvaluator.computeBucket(userId, flagKey)

        // At exactly bucket%, user should be excluded; at bucket+1%, included.
        if (bucket > 0) {
            assertFalse(
                RolloutEvaluator.isInRollout(userId, flagKey, bucket),
                "User with bucket $bucket should be excluded at ${bucket}%",
            )
        }
        if (bucket < 100) {
            assertTrue(
                RolloutEvaluator.isInRollout(userId, flagKey, bucket + 1),
                "User with bucket $bucket should be included at ${bucket + 1}%",
            )
        }
    }
}
