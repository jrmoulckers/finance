// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.monitoring

import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlin.test.*
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.minutes

/**
 * Tests for [MetricsCollector] — consent gating, event recording,
 * buffering, and flushing.
 */
class MetricsCollectorTest {

    private var currentTime = Instant.parse("2024-06-15T12:00:00Z")

    private val testClock = object : Clock {
        override fun now(): Instant = currentTime
    }

    // ── Consent gating ───────────────────────────────────────────────

    @Test
    fun recordScreenViewIsNoOpWithoutConsent() {
        val collector = MetricsCollector(consentProvider = { false }, clock = testClock)
        collector.recordScreenView("dashboard")
        assertEquals(0, collector.bufferedEventCount)
    }

    @Test
    fun recordFeatureUsageIsNoOpWithoutConsent() {
        val collector = MetricsCollector(consentProvider = { false }, clock = testClock)
        collector.recordFeatureUsage("create_budget")
        assertEquals(0, collector.bufferedEventCount)
    }

    @Test
    fun recordSyncPerformanceIsNoOpWithoutConsent() {
        val collector = MetricsCollector(consentProvider = { false }, clock = testClock)
        collector.recordSyncPerformance(100L, 10, true)
        assertEquals(0, collector.bufferedEventCount)
    }

    @Test
    fun flushReturnsEmptyWithoutConsent() {
        val collector = MetricsCollector(consentProvider = { false }, clock = testClock)
        val events = collector.flushEvents()
        assertTrue(events.isEmpty())
    }

    // ── Event recording ──────────────────────────────────────────────

    @Test
    fun recordScreenViewAddsEvent() {
        val collector = MetricsCollector(consentProvider = { true }, clock = testClock)
        collector.recordScreenView("dashboard")
        assertEquals(1, collector.bufferedEventCount)
    }

    @Test
    fun recordScreenViewEventProperties() {
        val collector = MetricsCollector(consentProvider = { true }, clock = testClock)
        collector.recordScreenView("budget_list")
        val events = collector.flushEvents()
        assertEquals(1, events.size)
        val event = events[0]
        assertEquals("screen_view", event.name)
        assertEquals("budget_list", event.properties["screen"])
        assertEquals(currentTime, event.timestamp)
    }

    @Test
    fun recordFeatureUsageAddsEvent() {
        val collector = MetricsCollector(consentProvider = { true }, clock = testClock)
        collector.recordFeatureUsage("create_budget", mapOf("period" to "MONTHLY"))
        val events = collector.flushEvents()
        assertEquals(1, events.size)
        val event = events[0]
        assertEquals("feature_usage", event.name)
        assertEquals("create_budget", event.properties["feature"])
        assertEquals("MONTHLY", event.properties["period"])
    }

    @Test
    fun recordSyncPerformanceAddsEvent() {
        val collector = MetricsCollector(consentProvider = { true }, clock = testClock)
        collector.recordSyncPerformance(1500L, 42, true)
        val events = collector.flushEvents()
        assertEquals(1, events.size)
        val event = events[0]
        assertEquals("sync_performance", event.name)
        assertEquals("1500", event.properties["duration_ms"])
        assertEquals("42", event.properties["record_count"])
        assertEquals("true", event.properties["success"])
    }

    // ── Flushing ─────────────────────────────────────────────────────

    @Test
    fun flushReturnsCopiedEvents() {
        val collector = MetricsCollector(consentProvider = { true }, clock = testClock)
        collector.recordScreenView("a")
        collector.recordScreenView("b")
        val flushed = collector.flushEvents()
        assertEquals(2, flushed.size)
        assertEquals(0, collector.bufferedEventCount, "Buffer should be empty after flush")
    }

    @Test
    fun flushDoesNotReturnEventsAfterConsentRevoked() {
        var consent = true
        val collector = MetricsCollector(consentProvider = { consent }, clock = testClock)
        collector.recordScreenView("a")
        consent = false
        val flushed = collector.flushEvents()
        assertTrue(flushed.isEmpty())
    }

    // ── Clear ────────────────────────────────────────────────────────

    @Test
    fun clearEventsEmptiesBuffer() {
        val collector = MetricsCollector(consentProvider = { true }, clock = testClock)
        collector.recordScreenView("a")
        collector.recordScreenView("b")
        assertEquals(2, collector.bufferedEventCount)
        collector.clearEvents()
        assertEquals(0, collector.bufferedEventCount)
    }

    // ── Multiple events ──────────────────────────────────────────────

    @Test
    fun multipleEventsAreBuffered() {
        val collector = MetricsCollector(consentProvider = { true }, clock = testClock)
        collector.recordScreenView("a")
        collector.recordFeatureUsage("b")
        collector.recordSyncPerformance(100, 5, false)
        assertEquals(3, collector.bufferedEventCount)
    }

    // ── Timestamp progression ────────────────────────────────────────

    @Test
    fun eventsRecordTimestampsFromClock() {
        val collector = MetricsCollector(consentProvider = { true }, clock = testClock)
        val t1 = currentTime
        collector.recordScreenView("first")
        currentTime = currentTime + 5.minutes
        val t2 = currentTime
        collector.recordScreenView("second")

        val events = collector.flushEvents()
        assertEquals(t1, events[0].timestamp)
        assertEquals(t2, events[1].timestamp)
    }
}
