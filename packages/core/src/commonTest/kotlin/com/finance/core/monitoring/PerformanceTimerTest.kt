// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.monitoring

import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlin.test.*
import kotlin.time.Duration.Companion.milliseconds

/**
 * Tests for [PerformanceTimer] — start/stop, elapsed measurement,
 * single-stop semantics, and operation naming.
 */
class PerformanceTimerTest {

    private var currentTime = Instant.parse("2024-06-15T12:00:00Z")

    private val testClock = object : Clock {
        override fun now(): Instant = currentTime
    }

    // ── Basic measurement ────────────────────────────────────────────

    @Test
    fun timerMeasuresElapsedTime() {
        val timer = PerformanceTimer.start(clock = testClock, operationName = "test")
        currentTime = currentTime + 500.milliseconds
        val elapsed = timer.stop()
        assertEquals(500L, elapsed)
    }

    @Test
    fun timerMeasuresZeroDuration() {
        val timer = PerformanceTimer.start(clock = testClock)
        val elapsed = timer.stop()
        assertEquals(0L, elapsed)
    }

    // ── Single-stop semantics ────────────────────────────────────────

    @Test
    fun stopReturnsConsistentValue() {
        val timer = PerformanceTimer.start(clock = testClock)
        currentTime = currentTime + 100.milliseconds
        val first = timer.stop()
        currentTime = currentTime + 500.milliseconds // time advances but timer is stopped
        val second = timer.stop()
        assertEquals(first, second, "Multiple stop() calls should return the same value")
    }

    @Test
    fun isStoppedIsFalseBeforeStop() {
        val timer = PerformanceTimer.start(clock = testClock)
        assertFalse(timer.isStopped)
    }

    @Test
    fun isStoppedIsTrueAfterStop() {
        val timer = PerformanceTimer.start(clock = testClock)
        timer.stop()
        assertTrue(timer.isStopped)
    }

    // ── Live elapsed (before stop) ───────────────────────────────────

    @Test
    fun elapsedMsReturnsLiveValueBeforeStop() {
        val timer = PerformanceTimer.start(clock = testClock)
        currentTime = currentTime + 200.milliseconds
        assertEquals(200L, timer.elapsedMs)
        currentTime = currentTime + 300.milliseconds
        assertEquals(500L, timer.elapsedMs)
    }

    @Test
    fun elapsedMsFrozenAfterStop() {
        val timer = PerformanceTimer.start(clock = testClock)
        currentTime = currentTime + 200.milliseconds
        timer.stop()
        currentTime = currentTime + 1000.milliseconds
        assertEquals(200L, timer.elapsedMs)
    }

    // ── Operation name ───────────────────────────────────────────────

    @Test
    fun operationNameIsRecorded() {
        val timer = PerformanceTimer.start(clock = testClock, operationName = "sync_delta")
        assertEquals("sync_delta", timer.operationName)
    }

    @Test
    fun defaultOperationNameIsEmpty() {
        val timer = PerformanceTimer.start(clock = testClock)
        assertEquals("", timer.operationName)
    }

    // ── Start time ───────────────────────────────────────────────────

    @Test
    fun startedAtCapturesStartInstant() {
        val startInstant = currentTime
        val timer = PerformanceTimer.start(clock = testClock)
        assertEquals(startInstant, timer.startedAt)
    }

    // ── Coerce non-negative ──────────────────────────────────────────

    @Test
    fun elapsedMsNeverNegative() {
        // If clock goes backward (e.g., NTP adjustment), elapsed should be 0
        val timer = PerformanceTimer.start(clock = testClock)
        currentTime = currentTime - 100.milliseconds // time goes backward
        assertEquals(0L, timer.elapsedMs)
    }
}
