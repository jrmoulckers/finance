// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.narration

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Tests for [DashboardNarrator], the composer that joins the steady-state
 * [TemplateNarrationGenerator] output (#2707) with [AnomalyNarrator] segments
 * into the single dashboard [Narration] required by #2394.
 *
 * The base snapshot is the shared §9 worked-example fixture; signals are layered
 * on via `copy` so the composition — ordering, mode limits, and the
 * material-before-uncertainty rule — is verified against a realistic state.
 */
class DashboardNarratorTest {

    private val json = Json { ignoreUnknownKeys = true }
    private val narrator = DashboardNarrator()

    private fun baseSnapshot(): FinancialStateSnapshot {
        val text =
            requireNotNull(
                javaClass.getResourceAsStream(
                    "/narration-fixtures/snapshots/02-bill-due-soon.json",
                ),
            ) { "missing fixture" }
                .bufferedReader()
                .use { it.readText() }
        return json.decodeFromString(FinancialStateSnapshot.serializer(), text)
    }

    private fun signal(
        id: String,
        kind: String,
        observedCents: Long,
        lowCents: Long,
        highCents: Long,
        level: ConfidenceLevel = ConfidenceLevel.HIGH,
    ): Signal =
        Signal(
            id = id,
            kind = kind,
            observedCents = observedCents,
            expectedLowCents = lowCents,
            expectedHighCents = highCents,
            confidence = Confidence(level, 0.9, ConfidenceBasis.SAMPLE_SIZE),
        )

    @Test
    fun `with no signals the dashboard narration matches the template narration`() {
        val snapshot = baseSnapshot()

        val dashboard = narrator.generate(snapshot, NarrationMode.DETAILED)
        val template = TemplateNarrationGenerator().generate(snapshot, NarrationMode.DETAILED)

        assertEquals(template, dashboard)
    }

    @Test
    fun `detailed mode keeps anomaly facts ahead of every uncertainty note`() {
        val snapshot =
            baseSnapshot().copy(
                signals =
                    listOf(
                        // Low confidence -> contributes an anomaly uncertainty note.
                        signal("groceries", "groceries", 40000, 20000, 30000, ConfidenceLevel.LOW),
                    ),
            )

        val dashboard = narrator.generate(snapshot, NarrationMode.DETAILED)
        val kinds = dashboard.segments.map { it.kind }

        // The fixture trend is low-confidence, so the template appends an
        // uncertainty note; the anomaly narrator appends its own. Both must
        // sit after all material (insight) content.
        val lastInsight = kinds.indexOfLast { it == SegmentKind.INSIGHT }
        val firstUncertainty = kinds.indexOfFirst { it == SegmentKind.UNCERTAINTY }
        assertTrue(lastInsight in 0 until firstUncertainty, kinds.toString())

        val ids = dashboard.segments.map { it.id }
        assertEquals(2, ids.count { it.startsWith("anomaly") })
        assertTrue(ids.contains("anomaly.groceries"))
        assertTrue(ids.contains("anomaly.uncertainty"))
        assertEquals(SegmentKind.UNCERTAINTY, dashboard.segments.last().kind)
    }

    @Test
    fun `concise mode appends at most one calm anomaly and no uncertainty notes`() {
        val snapshot =
            baseSnapshot().copy(
                signals =
                    listOf(
                        signal("small", "dining", 31500, 20000, 30000),
                        signal("big", "groceries", 60000, 20000, 30000),
                    ),
            )

        val dashboard = narrator.generate(snapshot, NarrationMode.CONCISE)
        val ids = dashboard.segments.map { it.id }

        assertEquals(1, ids.count { it.startsWith("anomaly") })
        assertTrue(ids.contains("anomaly.big"))
        assertTrue(dashboard.segments.none { it.kind == SegmentKind.UNCERTAINTY })
    }

    @Test
    fun `composed narration preserves the template headline and stays non-alarmist`() {
        val snapshot =
            baseSnapshot().copy(
                signals = listOf(signal("groceries", "groceries", 60000, 20000, 30000)),
            )

        val dashboard = narrator.generate(snapshot, NarrationMode.DETAILED)

        assertEquals("summary", dashboard.headline.id)
        assertTrue(dashboard.headline.text.startsWith("Your Electric bill"))
        val combined = dashboard.plainText() + " " + dashboard.screenReaderText()
        assertNull(NarrationText.firstBannedTerm(combined))
    }
}
