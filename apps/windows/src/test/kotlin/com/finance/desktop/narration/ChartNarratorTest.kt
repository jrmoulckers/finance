// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.narration

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Deterministic tests for [ChartNarrator] — the narrator that turns a chart's
 * already-computed series into the shared [Narration] contract so Canvas charts
 * are speakable by Narrator / UI Automation. Pure and model-free.
 */
class ChartNarratorTest {

    private val performancePoints =
        listOf(
            ChartValuePoint("Day 1", 40000.0),
            ChartValuePoint("Day 2", 39000.0),
            ChartValuePoint("Day 3", 41000.0),
            ChartValuePoint("Day 4", 42000.0),
        )

    private val allocationSlices =
        listOf(
            ChartCategorySlice("US Stocks", 0.56),
            ChartCategorySlice("International", 0.12),
            ChartCategorySlice("Bonds", 0.20),
            ChartCategorySlice("Real Estate", 0.07),
            ChartCategorySlice("Cash", 0.05),
        )

    @Test
    fun `performance headline states direction, endpoints and percent change`() {
        val narration =
            ChartNarrator.narratePerformance(
                rangeText = "1 month",
                rangeSpoken = "one month",
                points = performancePoints,
            )

        assertEquals(
            "Performance, 1 month. Portfolio rose from $40,000 to $42,000, up 5.0%.",
            narration.headline.text,
        )
        assertEquals(
            "Performance, one month. Portfolio rose from forty thousand dollars to " +
                "forty-two thousand dollars, up 5.0 percent.",
            narration.headline.a11y.screenReaderText,
        )
        assertEquals(2, narration.headline.a11y.headingLevel)
        assertEquals(A11yRole.STATUS, narration.headline.a11y.role)
    }

    @Test
    fun `performance range segment reports the low and high points`() {
        val narration =
            ChartNarrator.narratePerformance(
                rangeText = "1 month",
                rangeSpoken = "one month",
                points = performancePoints,
            )

        val range = narration.segments.single()
        assertEquals("performance.range", range.id)
        assertEquals("Range: low $39,000 at Day 2, high $42,000 at Day 4.", range.text)
        assertEquals(
            "Range: low thirty-nine thousand dollars at Day 2, " +
                "high forty-two thousand dollars at Day 4.",
            range.a11y.screenReaderText,
        )
    }

    @Test
    fun `performance handles a declining series without alarmist wording`() {
        val narration =
            ChartNarrator.narratePerformance(
                rangeText = "1 week",
                rangeSpoken = "one week",
                points =
                    listOf(
                        ChartValuePoint("Mon", 42000.0),
                        ChartValuePoint("Fri", 40000.0),
                    ),
            )

        assertTrue(narration.headline.text.contains("declined from $42,000 to $40,000, down"))
        assertEquals(null, NarrationText.firstBannedTerm(narration.screenReaderText()))
    }

    @Test
    fun `empty performance series narrates a no-data message`() {
        val narration =
            ChartNarrator.narratePerformance(
                rangeText = "1 month",
                rangeSpoken = "one month",
                points = emptyList(),
            )

        assertEquals("Performance, 1 month. No performance data yet.", narration.headline.text)
        assertTrue(narration.segments.isEmpty())
    }

    @Test
    fun `allocation narration lists every slice with spoken percentages`() {
        val narration = ChartNarrator.narrateAllocation(allocationSlices)

        assertEquals(
            "Asset allocation: US Stocks 56%, International 12%, Bonds 20%, " +
                "Real Estate 7%, Cash 5%.",
            narration.headline.text,
        )
        assertEquals(
            "Asset allocation: US Stocks 56 percent, International 12 percent, " +
                "Bonds 20 percent, Real Estate 7 percent, Cash 5 percent.",
            narration.headline.a11y.screenReaderText,
        )
        assertTrue(narration.segments.isEmpty())
    }

    @Test
    fun `empty allocation narrates a no-holdings message`() {
        val narration = ChartNarrator.narrateAllocation(emptyList())

        assertEquals("Asset allocation: no holdings yet.", narration.headline.text)
    }

    @Test
    fun `chart narrations are polite, never assertive`() {
        val performance =
            ChartNarrator.narratePerformance(
                rangeText = "1 month",
                rangeSpoken = "one month",
                points = performancePoints,
            )
        val allocation = ChartNarrator.narrateAllocation(allocationSlices)

        val all = listOf(performance, allocation)
        for (narration in all) {
            val segments = listOf(narration.headline) + narration.segments
            assertTrue(segments.none { it.a11y.ariaLive == AriaLive.ASSERTIVE })
            assertTrue(segments.all { it.a11y.ariaLive == AriaLive.POLITE })
            assertEquals(GeneratorKind.TEMPLATE, narration.provenance.generator)
        }
    }
}
