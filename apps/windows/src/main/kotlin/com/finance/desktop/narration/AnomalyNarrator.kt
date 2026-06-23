// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.narration

import com.finance.desktop.narration.NarrationText.capitalizeFirst
import com.finance.desktop.narration.NarrationText.formatCents
import com.finance.desktop.narration.NarrationText.spellCents
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max

// =============================================================================
// AnomalyNarrator — deterministic, on-device narration of notable deltas
// =============================================================================
//
// The `TemplateNarrationGenerator` (#2707) narrates steady-state dashboard facts
// — net worth, the most time-relevant bill, budgets, the net-worth trend, and
// goals. It deliberately does NOT speak the `signals` carried by a
// [FinancialStateSnapshot]: those are pre-classified ANOMALIES (a spending topic
// observed outside its usual range), and #2394 asks specifically for narration
// of "anomalies" alongside states and trends.
//
// This narrator fills that gap. It is the deterministic TEMPLATE layer for
// anomalies — no model, no network, no I/O. A [Signal] is already computed by an
// upstream engine (observed cents plus an expected low/high band); this code
// only turns that pre-computed delta into calm, Narrator-friendly prose.
//
// Design rules it upholds (mirrors `TemplateNarrationGenerator`):
//   * Calm, non-alarmist tone (design §3, §5.4). A delta is "a little above its
//     usual range", never a "spike", "alert", or "warning". The banned-term
//     golden test fails the build if alarmist vocabulary leaks in.
//   * Confidence/uncertainty is always surfaced. Low-confidence signals are
//     hedged inline ("Early signal …") and, in detailed mode, summarised by an
//     appended `uncertainty` segment.
//   * Concise vs. detailed. Concise speaks only the single most material
//     anomaly; detailed speaks them all, most-material first.
//
// Output is the shared [NarrationSegment] model so the UI Automation projection
// (#2707) can map every segment to Narrator labels with no extra coupling.
// Anomalies are emitted as [SegmentKind.INSIGHT] segments — a notable, material
// fact rather than steady state — reusing the existing contract unchanged.
class AnomalyNarrator {

    /**
     * Renders the anomaly [signals] into ordered [NarrationSegment]s for [mode].
     *
     * Only signals whose observed value falls OUTSIDE their expected band are
     * narrated; a value inside the band is not anomalous and is skipped. The
     * result is ordered most-material first (largest relative deviation), with a
     * stable tie-break on [Signal.id] so output is fully reproducible.
     *
     * In [NarrationMode.DETAILED] a trailing `uncertainty` segment is appended
     * when any narrated anomaly is low confidence.
     */
    fun generate(
        signals: List<Signal>,
        mode: NarrationMode,
    ): List<NarrationSegment> {
        val material = materialSegments(signals, mode)
        if (mode == NarrationMode.CONCISE) return material
        return material + uncertaintySegments(signals, material)
    }

    /** The anomaly fact segments (no uncertainty note), ordered + mode-limited. */
    fun materialSegments(
        signals: List<Signal>,
        mode: NarrationMode,
    ): List<NarrationSegment> {
        val ranked =
            signals
                .mapNotNull { signal -> deviationOf(signal)?.let { signal to it } }
                .sortedWith(
                    compareByDescending<Pair<Signal, Deviation>> { it.second.relative }
                        .thenBy { it.first.id },
                )
        val limited =
            when (mode) {
                NarrationMode.CONCISE -> ranked.take(CONCISE_LIMIT)
                NarrationMode.DETAILED -> ranked
            }
        return limited.map { (signal, deviation) -> anomalySegment(signal, deviation) }
    }

    /** A single `uncertainty` note when any [material] anomaly is low confidence. */
    fun uncertaintySegments(
        signals: List<Signal>,
        material: List<NarrationSegment>,
    ): List<NarrationSegment> {
        val renderedIds = material.map { it.id }.toSet()
        val anyLow =
            signals.any {
                segmentId(it) in renderedIds && it.confidence.level == ConfidenceLevel.LOW
            }
        if (!anyLow) return emptyList()
        val text =
            "One note on confidence: some of these signals are based on a short " +
                "history, so treat them as gentle heads-ups rather than firm conclusions."
        val screenReader =
            "One note on confidence. Some of these signals are based on a short " +
                "history, so treat them as gentle heads-ups rather than firm conclusions."
        return listOf(
            NarrationSegment(
                id = "anomaly.uncertainty",
                kind = SegmentKind.UNCERTAINTY,
                text = text,
                confidence = LOW_NOTE_CONFIDENCE,
                a11y =
                    A11yMetadata(
                        screenReaderText = screenReader,
                        ariaLive = AriaLive.POLITE,
                        role = A11yRole.NOTE,
                        headingLevel = null,
                    ),
                sourceRefs = listOf("signals"),
            ),
        )
    }

    // -- Segment construction ----------------------------------------------

    private fun anomalySegment(
        signal: Signal,
        deviation: Deviation,
    ): NarrationSegment {
        val label = topicLabel(signal.kind)
        val position = positionPhrase(deviation)
        val band =
            "its usual range of ${formatCents(signal.expectedLowCents)} to " +
                formatCents(signal.expectedHighCents)
        val spokenBand =
            "its usual range of ${spellCents(signal.expectedLowCents)} to " +
                spellCents(signal.expectedHighCents)

        val bodyVisible =
            "your $label came in at ${formatCents(signal.observedCents)} this period, " +
                "$position $band."
        val bodySpoken =
            "Your $label came in at ${spellCents(signal.observedCents)} this period. " +
                "${capitalizeFirst(position)} $spokenBand."

        val (text, screenReader) =
            when (signal.confidence.level) {
                ConfidenceLevel.LOW -> {
                    val tail =
                        " This is based on limited history, so it's just a gentle heads-up."
                    val visible = "Early signal: $bodyVisible$tail"
                    val spoken = "Early signal. $bodySpoken$tail"
                    visible to spoken
                }
                ConfidenceLevel.MEDIUM -> {
                    val visible = "Based on recent activity, $bodyVisible"
                    val spoken = "Based on recent activity. $bodySpoken"
                    visible to spoken
                }
                ConfidenceLevel.HIGH -> capitalizeFirst(bodyVisible) to bodySpoken
            }

        return NarrationSegment(
            id = segmentId(signal),
            kind = SegmentKind.INSIGHT,
            text = text,
            confidence = signal.confidence,
            a11y =
                A11yMetadata(
                    screenReaderText = screenReader,
                    ariaLive = AriaLive.POLITE,
                    role = A11yRole.NOTE,
                    headingLevel = null,
                ),
            sourceRefs = listOf("signal.${signal.id}"),
        )
    }

    // -- Deviation + phrasing ----------------------------------------------

    /** A pre-computed observed value's position relative to its expected band. */
    private data class Deviation(
        val above: Boolean,
        /** Relative size of the breach (0.10 == 10% past the nearer edge). */
        val relative: Double,
    )

    private fun deviationOf(signal: Signal): Deviation? {
        val low = minOf(signal.expectedLowCents, signal.expectedHighCents)
        val high = maxOf(signal.expectedLowCents, signal.expectedHighCents)
        return when {
            signal.observedCents > high -> {
                val edge = max(abs(high), 1L).toDouble()
                Deviation(above = true, relative = (signal.observedCents - high) / edge)
            }
            signal.observedCents < low -> {
                val edge = max(abs(low), 1L).toDouble()
                Deviation(above = false, relative = (low - signal.observedCents) / edge)
            }
            else -> null
        }
    }

    private fun positionPhrase(deviation: Deviation): String {
        val magnitude =
            when {
                deviation.relative < SLIGHT_THRESHOLD -> "a little "
                deviation.relative < MODERATE_THRESHOLD -> ""
                else -> "noticeably "
            }
        val direction = if (deviation.above) "above" else "below"
        return "$magnitude$direction".trim()
    }

    /**
     * Humanises a [Signal.kind] code into a calm topic noun. Direction suffixes
     * are stripped so the prose carries the tone, not the raw classifier name:
     * "dining_spike" -> "dining", "subscription_increase" -> "subscription
     * increase".
     */
    private fun topicLabel(kind: String): String {
        val cleaned =
            kind.lowercase(Locale.US)
                .removeSuffix("_spike")
                .removeSuffix("_dip")
                .removeSuffix("_anomaly")
                .removeSuffix("_signal")
        val humanised = cleaned.replace('_', ' ').trim()
        return humanised.ifEmpty { "spending" }
    }

    private fun segmentId(signal: Signal): String = "anomaly.${signal.id}"

    private companion object {
        const val CONCISE_LIMIT = 1
        const val SLIGHT_THRESHOLD = 0.10
        const val MODERATE_THRESHOLD = 0.25

        val LOW_NOTE_CONFIDENCE =
            Confidence(ConfidenceLevel.LOW, 0.4, ConfidenceBasis.BLENDED)
    }
}
