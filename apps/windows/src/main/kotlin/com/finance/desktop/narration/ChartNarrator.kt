// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.narration

import com.finance.desktop.narration.NarrationText.formatWholeDollars
import com.finance.desktop.narration.NarrationText.oneDecimal
import com.finance.desktop.narration.NarrationText.percentInt
import com.finance.desktop.narration.NarrationText.roundDollars
import com.finance.desktop.narration.NarrationText.spellWholeDollars
import kotlin.math.abs

// =============================================================================
// ChartNarrator — deterministic narration for Canvas chart surfaces
// =============================================================================
//
// Canvas charts have no intrinsic accessibility tree, so each chart is exposed
// to Narrator / UI Automation as a single labelled summary node plus an optional
// data-table alternative (see `docs/windows/ultrawide-portfolio-cockpit-layout.md`
// §7). This narrator turns a chart's already-computed series into the same
// [Narration] contract the snapshot generator emits, so the Compose semantics
// mapping, live region, keyboard replay, and "view as table" affordance work
// uniformly for any chart.
//
// Conventions mirror the narration contract (design §5.2): money is spelled into
// words for screen-reader text, percentages keep digits and speak "percent", and
// every value also has a visible glyph form. All output is pure and unit-tested.

/** A single value point of a performance/line/area chart (value in dollars). */
data class ChartValuePoint(
    val label: String,
    val value: Double,
)

/** A single category slice of an allocation/donut chart (fraction in 0..1). */
data class ChartCategorySlice(
    val label: String,
    val fraction: Double,
)

object ChartNarrator {

    private const val SCHEMA_VERSION = 1

    private val RULE_HIGH = Confidence(ConfidenceLevel.HIGH, 1.0, ConfidenceBasis.RULE)
    private val TEMPLATE_PROVENANCE = Provenance(generator = GeneratorKind.TEMPLATE, deterministic = true)

    /**
     * Narrates a performance/value series for the selected range.
     *
     * @param rangeText human-readable range for visible prose, e.g. "1 month".
     * @param rangeSpoken spoken range for screen-reader text, e.g. "one month".
     * @param points the value series in chronological order (dollars).
     * @param seriesLabel panel label, default "Performance".
     */
    fun narratePerformance(
        rangeText: String,
        rangeSpoken: String,
        points: List<ChartValuePoint>,
        seriesLabel: String = "Performance",
        locale: String = "en-US",
    ): Narration {
        if (points.isEmpty()) {
            return emptyNarration(
                id = "performance.summary",
                visible = "$seriesLabel, $rangeText. No performance data yet.",
                spoken = "$seriesLabel, $rangeSpoken. No performance data yet.",
                sourceRef = "performanceData",
                locale = locale,
            )
        }

        val first = points.first().value
        val last = points.last().value
        val firstDollars = roundDollars(first)
        val lastDollars = roundDollars(last)
        val signedPct = if (first != 0.0) (last - first) / first * 100.0 else 0.0
        val absPct = abs(signedPct)

        val minPoint = points.minByOrNull { it.value } ?: points.first()
        val maxPoint = points.maxByOrNull { it.value } ?: points.last()
        val minDollars = roundDollars(minPoint.value)
        val maxDollars = roundDollars(maxPoint.value)

        val direction =
            when {
                last > first -> TrendDirection.UP
                last < first -> TrendDirection.DOWN
                else -> TrendDirection.FLAT
            }

        val headlineText: String
        val headlineSpoken: String
        if (direction == TrendDirection.FLAT) {
            headlineText =
                "$seriesLabel, $rangeText. Portfolio held about steady at " +
                    "${formatWholeDollars(lastDollars)}."
            headlineSpoken =
                "$seriesLabel, $rangeSpoken. Portfolio held about steady at " +
                    "${spellWholeDollars(lastDollars)}."
        } else {
            val verb = if (direction == TrendDirection.UP) "rose" else "declined"
            val dirWord = if (direction == TrendDirection.UP) "up" else "down"
            headlineText =
                "$seriesLabel, $rangeText. Portfolio $verb from " +
                    "${formatWholeDollars(firstDollars)} to ${formatWholeDollars(lastDollars)}, " +
                    "$dirWord ${oneDecimal(absPct)}%."
            headlineSpoken =
                "$seriesLabel, $rangeSpoken. Portfolio $verb from " +
                    "${spellWholeDollars(firstDollars)} to ${spellWholeDollars(lastDollars)}, " +
                    "$dirWord ${oneDecimal(absPct)} percent."
        }

        val headline =
            NarrationSegment(
                id = "performance.summary",
                kind = SegmentKind.SUMMARY,
                text = headlineText,
                confidence = RULE_HIGH,
                a11y =
                    A11yMetadata(
                        screenReaderText = headlineSpoken,
                        ariaLive = AriaLive.POLITE,
                        role = A11yRole.STATUS,
                        headingLevel = HEADING_LEVEL,
                    ),
                sourceRefs = listOf("performanceData"),
            )

        val rangeSegment =
            NarrationSegment(
                id = "performance.range",
                kind = SegmentKind.INSIGHT,
                text =
                    "Range: low ${formatWholeDollars(minDollars)} at ${minPoint.label}, " +
                        "high ${formatWholeDollars(maxDollars)} at ${maxPoint.label}.",
                confidence = RULE_HIGH,
                a11y =
                    A11yMetadata(
                        screenReaderText =
                            "Range: low ${spellWholeDollars(minDollars)} at ${minPoint.label}, " +
                                "high ${spellWholeDollars(maxDollars)} at ${maxPoint.label}.",
                        ariaLive = AriaLive.POLITE,
                        role = A11yRole.NOTE,
                        headingLevel = null,
                    ),
                sourceRefs = listOf("performanceData"),
            )

        return Narration(
            mode = NarrationMode.CONCISE,
            schemaVersion = SCHEMA_VERSION,
            locale = locale,
            headline = headline,
            segments = listOf(rangeSegment),
            provenance = TEMPLATE_PROVENANCE,
        )
    }

    /**
     * Narrates an allocation/donut chart as a single labelled summary node. Each
     * legend row keeps its own per-slice description in the UI; this is the
     * merged summary Narrator reads once instead of every colored swatch.
     */
    fun narrateAllocation(
        slices: List<ChartCategorySlice>,
        locale: String = "en-US",
    ): Narration {
        if (slices.isEmpty()) {
            return emptyNarration(
                id = "allocation.summary",
                visible = "Asset allocation: no holdings yet.",
                spoken = "Asset allocation: no holdings yet.",
                sourceRef = "allocationData",
                locale = locale,
            )
        }

        val visible =
            "Asset allocation: " +
                slices.joinToString(", ") { "${it.label} ${percentInt(it.fraction)}%" } + "."
        val spoken =
            "Asset allocation: " +
                slices.joinToString(", ") { "${it.label} ${percentInt(it.fraction)} percent" } + "."

        val headline =
            NarrationSegment(
                id = "allocation.summary",
                kind = SegmentKind.SUMMARY,
                text = visible,
                confidence = RULE_HIGH,
                a11y =
                    A11yMetadata(
                        screenReaderText = spoken,
                        ariaLive = AriaLive.POLITE,
                        role = A11yRole.STATUS,
                        headingLevel = HEADING_LEVEL,
                    ),
                sourceRefs = listOf("allocationData"),
            )

        return Narration(
            mode = NarrationMode.CONCISE,
            schemaVersion = SCHEMA_VERSION,
            locale = locale,
            headline = headline,
            segments = emptyList(),
            provenance = TEMPLATE_PROVENANCE,
        )
    }

    private fun emptyNarration(
        id: String,
        visible: String,
        spoken: String,
        sourceRef: String,
        locale: String,
    ): Narration =
        Narration(
            mode = NarrationMode.CONCISE,
            schemaVersion = SCHEMA_VERSION,
            locale = locale,
            headline =
                NarrationSegment(
                    id = id,
                    kind = SegmentKind.SUMMARY,
                    text = visible,
                    confidence = RULE_HIGH,
                    a11y =
                        A11yMetadata(
                            screenReaderText = spoken,
                            ariaLive = AriaLive.POLITE,
                            role = A11yRole.STATUS,
                            headingLevel = HEADING_LEVEL,
                        ),
                    sourceRefs = listOf(sourceRef),
                ),
            segments = emptyList(),
            provenance = TEMPLATE_PROVENANCE,
        )

    private const val HEADING_LEVEL = 2
}
