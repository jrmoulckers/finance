// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.monitoring

import kotlinx.datetime.Clock
import kotlinx.datetime.Instant

/**
 * Collects anonymous usage metrics with explicit consent gating.
 *
 * Every public method checks [consentProvider] before recording data.
 * If consent is not granted, calls are silent no-ops. Metrics never
 * contain PII, financial data, or device-unique identifiers.
 *
 * Recorded events are buffered locally and flushed by platform-specific
 * transport implementations. Call [flushEvents] to retrieve and clear
 * the buffer for transmission.
 *
 * @param consentProvider Returns true when the user has opted in to analytics.
 * @param clock Clock source for timestamps (injectable for testing).
 */
class MetricsCollector(
    private val consentProvider: () -> Boolean,
    private val clock: Clock = Clock.System,
) {

    private val eventBuffer = mutableListOf<MetricEvent>()

    /**
     * Record a screen view event.
     *
     * @param screenName Identifier for the screen (e.g., "budget_list", "settings").
     *   Must not contain user-specific data.
     */
    fun recordScreenView(screenName: String) {
        recordEvent("screen_view", mapOf("screen" to screenName))
    }

    /**
     * Record a feature usage event.
     *
     * @param featureName Identifier for the feature (e.g., "create_budget", "export_data").
     *   Must not contain user-specific or financial data.
     * @param properties Optional metadata about the usage. Values must be anonymous.
     */
    fun recordFeatureUsage(featureName: String, properties: Map<String, String> = emptyMap()) {
        recordEvent("feature_usage", properties + ("feature" to featureName))
    }

    /**
     * Record a sync performance event.
     *
     * @param durationMs Sync duration in milliseconds.
     * @param recordCount Number of records synced.
     * @param success Whether the sync completed successfully.
     */
    fun recordSyncPerformance(durationMs: Long, recordCount: Int, success: Boolean) {
        recordEvent(
            "sync_performance",
            mapOf(
                "duration_ms" to durationMs.toString(),
                "record_count" to recordCount.toString(),
                "success" to success.toString(),
            ),
        )
    }

    /**
     * Retrieve and clear all buffered metric events.
     *
     * Platform transport layers call this to collect events for
     * batch transmission to the analytics backend.
     *
     * @return List of buffered events. Empty if no events or consent not granted.
     */
    fun flushEvents(): List<MetricEvent> {
        if (!consentProvider()) return emptyList()

        val flushed = eventBuffer.toList()
        eventBuffer.clear()
        return flushed
    }

    /**
     * Discard all buffered events without transmitting.
     *
     * Called when the user revokes analytics consent.
     */
    fun clearEvents() {
        eventBuffer.clear()
    }

    /** Number of events currently buffered. */
    val bufferedEventCount: Int
        get() = eventBuffer.size

    private fun recordEvent(name: String, properties: Map<String, String>) {
        if (!consentProvider()) return

        eventBuffer.add(
            MetricEvent(
                name = name,
                timestamp = clock.now(),
                properties = properties,
            ),
        )
    }
}

/**
 * A single anonymous metric event.
 *
 * @property name Event type identifier (e.g., "screen_view", "feature_usage").
 * @property timestamp When the event occurred.
 * @property properties Key-value metadata. Must not contain PII or financial data.
 */
data class MetricEvent(
    val name: String,
    val timestamp: Instant,
    val properties: Map<String, String>,
)
