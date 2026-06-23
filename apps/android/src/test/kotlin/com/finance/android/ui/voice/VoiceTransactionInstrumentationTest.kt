// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.voice

import com.finance.core.monitoring.MetricsCollector
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Unit tests for [VoiceTransactionInstrumentation] (#2383).
 *
 * Verifies that only anonymous outcome metadata is recorded — never the
 * transcript, amounts, merchant, or any other transaction content — and that
 * analytics consent gates every event.
 */
class VoiceTransactionInstrumentationTest {

    private val safeKeys = setOf(
        "feature", "event", "source", "stage", "field",
        "field_count", "correction_count",
    )

    private fun collector(consent: Boolean) = MetricsCollector(consentProvider = { consent })

    @Test
    fun `records started event with source only`() {
        val metrics = collector(consent = true)
        VoiceTransactionInstrumentation(metrics)
            .recordEntryStarted(VoiceTransactionInstrumentation.EntrySource.ASSISTANT)

        val events = metrics.flushEvents()
        assertEquals(1, events.size)
        assertEquals("feature_usage", events[0].name)
        assertEquals("started", events[0].properties["event"])
        assertEquals("assistant", events[0].properties["source"])
    }

    @Test
    fun `completed event records only counts`() {
        val metrics = collector(consent = true)
        VoiceTransactionInstrumentation(metrics).recordEntryCompleted(fieldCount = 4, correctionCount = 1)

        val event = metrics.flushEvents().single()
        assertEquals("4", event.properties["field_count"])
        assertEquals("1", event.properties["correction_count"])
    }

    @Test
    fun `all event properties use only safe anonymous keys`() {
        val metrics = collector(consent = true)
        val instrumentation = VoiceTransactionInstrumentation(metrics)

        instrumentation.recordEntryStarted(VoiceTransactionInstrumentation.EntrySource.IN_APP_MIC)
        instrumentation.recordPromptShown(VoiceField.AMOUNT)
        instrumentation.recordFieldCorrected(VoiceField.MERCHANT)
        instrumentation.recordEntryCancelled(VoiceTransactionInstrumentation.CancelStage.REVIEW)
        instrumentation.recordEntryCompleted(fieldCount = 3, correctionCount = 0)
        instrumentation.recordOfflineDraftSaved()

        val events = metrics.flushEvents()
        assertEquals(6, events.size)
        events.forEach { event ->
            event.properties.keys.forEach { key ->
                assertTrue(key in safeKeys, "Unexpected metric key: $key")
            }
            // Field metrics carry only the field *name*, never a value.
            event.properties["field"]?.let { value ->
                assertTrue(value in setOf("amount", "merchant", "category", "account", "note"))
            }
        }
    }

    @Test
    fun `no events recorded without consent`() {
        val metrics = collector(consent = false)
        val instrumentation = VoiceTransactionInstrumentation(metrics)

        instrumentation.recordEntryStarted(VoiceTransactionInstrumentation.EntrySource.ASSISTANT)
        instrumentation.recordEntryCompleted(fieldCount = 5, correctionCount = 2)

        assertEquals(0, metrics.bufferedEventCount)
    }

    @Test
    fun `negative counts are clamped to zero`() {
        val metrics = collector(consent = true)
        VoiceTransactionInstrumentation(metrics).recordEntryCompleted(fieldCount = -3, correctionCount = -1)

        val event = metrics.flushEvents().single()
        assertEquals("0", event.properties["field_count"])
        assertEquals("0", event.properties["correction_count"])
    }
}
