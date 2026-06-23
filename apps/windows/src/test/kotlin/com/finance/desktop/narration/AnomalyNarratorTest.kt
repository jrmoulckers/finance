// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.narration

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Tests for the deterministic [AnomalyNarrator].
 *
 * Signals (anomalies) are constructed in code — they are tiny, derived inputs —
 * and the narrator runs with no model and no I/O, so every assertion is fully
 * reproducible in CI. Coverage spans the calm phrasing ladder, confidence
 * hedging, concise/detailed selection, ordering, and the non-alarmist tone gate.
 */
class AnomalyNarratorTest {

    private val narrator = AnomalyNarrator()

    private fun signal(
        id: String,
        kind: String,
        observedCents: Long,
        lowCents: Long,
        highCents: Long,
        level: ConfidenceLevel = ConfidenceLevel.HIGH,
        basis: ConfidenceBasis = ConfidenceBasis.SAMPLE_SIZE,
        score: Double = 0.9,
    ): Signal =
        Signal(
            id = id,
            kind = kind,
            observedCents = observedCents,
            expectedLowCents = lowCents,
            expectedHighCents = highCents,
            confidence = Confidence(level, score, basis),
        )

    @Test
    fun `a value inside its expected band is not anomalous and is skipped`() {
        val inRange = signal("s1", "dining", observedCents = 25000, lowCents = 20000, highCents = 30000)

        val segments = narrator.generate(listOf(inRange), NarrationMode.DETAILED)

        assertTrue(segments.isEmpty())
    }

    @Test
    fun `a small breach reads as 'a little above', not alarmist`() {
        val s = signal("dining", "dining_spike", observedCents = 31500, lowCents = 20000, highCents = 30000)

        val segment = narrator.generate(listOf(s), NarrationMode.CONCISE).single()

        assertEquals(SegmentKind.INSIGHT, segment.kind)
        assertTrue(segment.text.contains("a little above its usual range"), segment.text)
        // The classifier suffix "_spike" must never reach the prose.
        assertFalse(segment.text.contains("spike"))
        assertTrue(segment.text.lowercase().contains("your dining came in at"), segment.text)
    }

    @Test
    fun `a large breach reads as 'noticeably above' and still avoids alarm`() {
        val s = signal("groceries", "groceries", observedCents = 40000, lowCents = 20000, highCents = 30000)

        val segment = narrator.generate(listOf(s), NarrationMode.DETAILED).first()

        assertTrue(segment.text.contains("noticeably above its usual range"), segment.text)
        assertNull(NarrationText.firstBannedTerm(segment.text + " " + segment.a11y.screenReaderText))
    }

    @Test
    fun `a value below the band reads as 'below its usual range'`() {
        val s = signal("income", "income_dip", observedCents = 10000, lowCents = 20000, highCents = 25000)

        val segment = narrator.generate(listOf(s), NarrationMode.DETAILED).first()

        assertTrue(segment.text.contains("below its usual range"), segment.text)
        assertTrue(segment.text.lowercase().contains("your income came in at"), segment.text)
    }

    @Test
    fun `low-confidence signals are hedged as an early signal and add an uncertainty note`() {
        val s =
            signal(
                "subscriptions",
                "subscription_increase",
                observedCents = 5000,
                lowCents = 2000,
                highCents = 3000,
                level = ConfidenceLevel.LOW,
                score = 0.4,
            )

        val segments = narrator.generate(listOf(s), NarrationMode.DETAILED)

        val anomaly = segments.first()
        assertTrue(anomaly.text.startsWith("Early signal:"), anomaly.text)
        assertTrue(anomaly.text.contains("gentle heads-up"))
        assertTrue(anomaly.text.contains("subscription increase"))

        val uncertainty = segments.last()
        assertEquals(SegmentKind.UNCERTAINTY, uncertainty.kind)
        assertEquals("anomaly.uncertainty", uncertainty.id)
    }

    @Test
    fun `medium-confidence signals are framed as based on recent activity`() {
        val s =
            signal(
                "fuel",
                "fuel",
                observedCents = 9000,
                lowCents = 4000,
                highCents = 6000,
                level = ConfidenceLevel.MEDIUM,
                score = 0.7,
            )

        val segment = narrator.generate(listOf(s), NarrationMode.DETAILED).first()

        assertTrue(segment.text.startsWith("Based on recent activity,"), segment.text)
    }

    @Test
    fun `detailed mode adds no uncertainty note when every anomaly is confident`() {
        val s = signal("dining", "dining", observedCents = 40000, lowCents = 20000, highCents = 30000)

        val segments = narrator.generate(listOf(s), NarrationMode.DETAILED)

        assertTrue(segments.none { it.kind == SegmentKind.UNCERTAINTY })
    }

    @Test
    fun `anomalies are ordered most-material first`() {
        val small = signal("a-small", "dining", observedCents = 31500, lowCents = 20000, highCents = 30000)
        val big = signal("z-big", "groceries", observedCents = 60000, lowCents = 20000, highCents = 30000)

        val ids =
            narrator.generate(listOf(small, big), NarrationMode.DETAILED)
                .filter { it.kind == SegmentKind.INSIGHT }
                .map { it.id }

        assertEquals(listOf("anomaly.z-big", "anomaly.a-small"), ids)
    }

    @Test
    fun `concise mode speaks only the single most material anomaly`() {
        val small = signal("a-small", "dining", observedCents = 31500, lowCents = 20000, highCents = 30000)
        val big = signal("z-big", "groceries", observedCents = 60000, lowCents = 20000, highCents = 30000)

        val segments = narrator.generate(listOf(small, big), NarrationMode.CONCISE)

        assertEquals(1, segments.size)
        assertEquals("anomaly.z-big", segments.single().id)
    }

    @Test
    fun `every segment carries non-blank screen reader text, source refs, and a polite note role`() {
        val s =
            signal(
                "dining",
                "dining",
                observedCents = 40000,
                lowCents = 20000,
                highCents = 30000,
                level = ConfidenceLevel.LOW,
            )

        val segments = narrator.generate(listOf(s), NarrationMode.DETAILED)

        assertTrue(segments.isNotEmpty())
        for (segment in segments) {
            assertTrue(segment.a11y.screenReaderText.isNotBlank(), "blank SR for ${segment.id}")
            assertTrue(segment.sourceRefs.isNotEmpty(), "no sourceRefs for ${segment.id}")
            assertEquals(A11yRole.NOTE, segment.a11y.role)
            assertEquals(AriaLive.POLITE, segment.a11y.ariaLive)
            assertNull(segment.a11y.headingLevel)
        }
    }

    @Test
    fun `narration never uses banned, alarmist vocabulary across modes`() {
        val signals =
            listOf(
                signal("dining", "dining_spike", 40000, 20000, 30000, ConfidenceLevel.LOW),
                signal("income", "income_dip", 10000, 20000, 25000, ConfidenceLevel.MEDIUM),
                signal("rent", "rent", 150000, 140000, 145000, ConfidenceLevel.HIGH),
            )
        for (mode in NarrationMode.entries) {
            val segments = narrator.generate(signals, mode)
            val combined =
                segments.joinToString(" ") { it.text + " " + it.a11y.screenReaderText }
            val banned = NarrationText.firstBannedTerm(combined)
            assertNull(banned, "mode $mode leaked banned term: $banned")
        }
    }

    @Test
    fun `an empty signal list produces no narration`() {
        assertTrue(narrator.generate(emptyList(), NarrationMode.DETAILED).isEmpty())
        assertTrue(narrator.generate(emptyList(), NarrationMode.CONCISE).isEmpty())
    }
}
