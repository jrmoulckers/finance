// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.monitoring

import kotlinx.datetime.Instant
import kotlin.test.*
import kotlin.time.Duration.Companion.minutes

/**
 * Tests for [HealthStatus.evaluate] — verifies all threshold boundaries
 * and priority ordering.
 */
class HealthStatusTest {

    private val baseTime = Instant.parse("2024-06-15T12:00:00Z")

    // ── Healthy ──────────────────────────────────────────────────────

    @Test
    fun healthyWhenAllGood() {
        val status = HealthStatus.evaluate(
            lastSyncTime = baseTime,
            currentTime = baseTime + 1.minutes,
            failureCount = 0,
            pendingMutations = 0,
        )
        assertEquals(HealthStatus.Healthy, status)
    }

    @Test
    fun healthyWithLowPendingMutations() {
        val status = HealthStatus.evaluate(
            lastSyncTime = baseTime,
            currentTime = baseTime + 1.minutes,
            failureCount = 0,
            pendingMutations = 49, // just below degraded threshold
        )
        assertEquals(HealthStatus.Healthy, status)
    }

    // ── Unhealthy — no sync history ──────────────────────────────────

    @Test
    fun unhealthyWhenNeverSynced() {
        val status = HealthStatus.evaluate(
            lastSyncTime = null,
            currentTime = baseTime,
            failureCount = 0,
            pendingMutations = 0,
        )
        assertTrue(status is HealthStatus.Unhealthy)
        assertTrue(status.reason.contains("No successful sync"))
    }

    // ── Degraded — sync age ──────────────────────────────────────────

    @Test
    fun degradedWhenSyncAge5MinPlus() {
        val status = HealthStatus.evaluate(
            lastSyncTime = baseTime,
            currentTime = baseTime + 6.minutes,
            failureCount = 0,
            pendingMutations = 0,
        )
        assertTrue(status is HealthStatus.Degraded)
        assertTrue(status.reason.contains("5 minutes"))
    }

    @Test
    fun notDegradedWhenSyncAgeExactly5Min() {
        val status = HealthStatus.evaluate(
            lastSyncTime = baseTime,
            currentTime = baseTime + 5.minutes,
            failureCount = 0,
            pendingMutations = 0,
        )
        assertEquals(HealthStatus.Healthy, status)
    }

    // ── Unhealthy — sync age ─────────────────────────────────────────

    @Test
    fun unhealthyWhenSyncAge30MinPlus() {
        val status = HealthStatus.evaluate(
            lastSyncTime = baseTime,
            currentTime = baseTime + 31.minutes,
            failureCount = 0,
            pendingMutations = 0,
        )
        assertTrue(status is HealthStatus.Unhealthy)
        assertTrue(status.reason.contains("30 minutes"))
    }

    // ── Degraded — failure count ─────────────────────────────────────

    @Test
    fun degradedWithOneFailure() {
        val status = HealthStatus.evaluate(
            lastSyncTime = baseTime,
            currentTime = baseTime + 1.minutes,
            failureCount = 1,
            pendingMutations = 0,
        )
        assertTrue(status is HealthStatus.Degraded)
    }

    // ── Unhealthy — failure count ────────────────────────────────────

    @Test
    fun unhealthyWithManyFailures() {
        val status = HealthStatus.evaluate(
            lastSyncTime = baseTime,
            currentTime = baseTime + 1.minutes,
            failureCount = 4,
            pendingMutations = 0,
        )
        assertTrue(status is HealthStatus.Unhealthy)
    }

    @Test
    fun degradedWithThreeFailures() {
        // exactly at threshold (>= 1, not > 3)
        val status = HealthStatus.evaluate(
            lastSyncTime = baseTime,
            currentTime = baseTime + 1.minutes,
            failureCount = 3,
            pendingMutations = 0,
        )
        assertTrue(status is HealthStatus.Degraded)
    }

    // ── Degraded — pending mutations ─────────────────────────────────

    @Test
    fun degradedWithHighPendingMutations() {
        val status = HealthStatus.evaluate(
            lastSyncTime = baseTime,
            currentTime = baseTime + 1.minutes,
            failureCount = 0,
            pendingMutations = 50,
        )
        assertTrue(status is HealthStatus.Degraded)
    }

    // ── Unhealthy — pending mutations ────────────────────────────────

    @Test
    fun unhealthyWithVeryHighPendingMutations() {
        val status = HealthStatus.evaluate(
            lastSyncTime = baseTime,
            currentTime = baseTime + 1.minutes,
            failureCount = 0,
            pendingMutations = 201,
        )
        assertTrue(status is HealthStatus.Unhealthy)
    }

    // ── Priority: unhealthy takes precedence ─────────────────────────

    @Test
    fun unhealthyTakesPrecedenceOverDegraded() {
        val status = HealthStatus.evaluate(
            lastSyncTime = baseTime,
            currentTime = baseTime + 31.minutes, // unhealthy by age
            failureCount = 1, // degraded by failure
            pendingMutations = 50, // degraded by pending
        )
        assertTrue(status is HealthStatus.Unhealthy)
    }

    // ── Sealed class ─────────────────────────────────────────────────

    @Test
    fun healthyIsDataObject() {
        assertSame(HealthStatus.Healthy, HealthStatus.Healthy)
    }

    @Test
    fun degradedHasReason() {
        val status = HealthStatus.Degraded("test reason")
        assertEquals("test reason", status.reason)
    }

    @Test
    fun unhealthyHasReason() {
        val status = HealthStatus.Unhealthy("test reason")
        assertEquals("test reason", status.reason)
    }
}
