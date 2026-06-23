// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.accessibility

import com.finance.desktop.narration.A11yMetadata
import com.finance.desktop.narration.A11yRole
import com.finance.desktop.narration.AriaLive
import com.finance.desktop.narration.ChartNarrator
import com.finance.desktop.narration.ChartValuePoint
import com.finance.desktop.narration.screenReaderText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Pure JVM tests for the narration → Compose semantics / UI Automation mapping
 * that issue #2707 requires. These pin the projection of the deterministic
 * narration contract onto labels, descriptions, headings, and live regions
 * without needing a Compose UI harness or a Narrator device.
 */
class NarrationSemanticsTest {

    private val performancePoints =
        listOf(
            ChartValuePoint("Day 1", 40000.0),
            ChartValuePoint("Day 2", 39000.0),
            ChartValuePoint("Day 3", 41000.0),
            ChartValuePoint("Day 4", 42000.0),
        )

    private val performanceNarration =
        ChartNarrator.narratePerformance(
            rangeText = "1 month",
            rangeSpoken = "one month",
            points = performancePoints,
        )

    // -- AriaLive → NarrationLiveRegion ----------------------------------------

    @Test
    fun `aria live maps onto the compose-facing live region enum`() {
        assertEquals(NarrationLiveRegion.OFF, AriaLive.OFF.toNarrationLiveRegion())
        assertEquals(NarrationLiveRegion.POLITE, AriaLive.POLITE.toNarrationLiveRegion())
        assertEquals(NarrationLiveRegion.ASSERTIVE, AriaLive.ASSERTIVE.toNarrationLiveRegion())
    }

    // -- A11yMetadata → descriptor ---------------------------------------------

    @Test
    fun `metadata descriptor carries spoken label, heading level and politeness`() {
        val metadata =
            A11yMetadata(
                screenReaderText = "Performance, one month. Portfolio rose.",
                ariaLive = AriaLive.POLITE,
                role = A11yRole.STATUS,
                headingLevel = 2,
            )

        val descriptor = metadata.toSemanticsDescriptor()

        assertEquals("Performance, one month. Portfolio rose.", descriptor.contentDescription)
        assertEquals(2, descriptor.headingLevel)
        assertEquals(NarrationLiveRegion.POLITE, descriptor.liveRegion)
        assertTrue(descriptor.isHeading)
    }

    @Test
    fun `descriptor without a heading level is not a heading`() {
        val metadata =
            A11yMetadata(
                screenReaderText = "Range: low at Day 2, high at Day 4.",
                ariaLive = AriaLive.OFF,
                role = A11yRole.NOTE,
                headingLevel = null,
            )

        val descriptor = metadata.toSemanticsDescriptor()

        assertNull(descriptor.headingLevel)
        assertFalse(descriptor.isHeading)
        assertEquals(NarrationLiveRegion.OFF, descriptor.liveRegion)
    }

    // -- Narration → merged descriptor -----------------------------------------

    @Test
    fun `narration descriptor merges full spoken summary and uses headline metadata`() {
        val descriptor = performanceNarration.toSemanticsDescriptor()

        // The merged label is the complete screen-reader text (headline + segments).
        assertEquals(performanceNarration.screenReaderText(), descriptor.contentDescription)
        assertTrue(descriptor.contentDescription.contains("Performance, one month"))
        assertTrue(descriptor.contentDescription.contains("Range: low"))

        // Heading + politeness come from the headline (its place in reading order).
        assertEquals(2, descriptor.headingLevel)
        assertTrue(descriptor.isHeading)
        assertEquals(NarrationLiveRegion.POLITE, descriptor.liveRegion)
    }

    @Test
    fun `copy can suppress the live region for a non-announcing merged node`() {
        // The chart canvas node carries label + heading but delegates live
        // announcements to the dedicated announcer node (avoids double-speak).
        val descriptor =
            performanceNarration.toSemanticsDescriptor()
                .copy(liveRegion = NarrationLiveRegion.OFF)

        assertEquals(NarrationLiveRegion.OFF, descriptor.liveRegion)
        assertEquals(2, descriptor.headingLevel)
        assertTrue(descriptor.contentDescription.isNotBlank())
    }

    // -- NarrationAnnouncer (replay path) --------------------------------------

    @Test
    fun `announcer starts empty`() {
        assertEquals("", NarrationAnnouncer().announcement)
    }

    @Test
    fun `announcing the same text twice forces a distinct string for replay`() {
        val announcer = NarrationAnnouncer()
        val text = "Performance, one month. Portfolio rose."

        announcer.announce(text)
        val first = announcer.announcement
        announcer.announce(text)
        val second = announcer.announcement

        // Narrator only re-speaks a polite live region when the value changes,
        // so the replay path must alternate the raw string each call...
        assertNotEquals(first, second)
        // ...while never changing what is actually spoken (zero-width nonce only).
        assertEquals(text, first.replace("\u200B", ""))
        assertEquals(text, second.replace("\u200B", ""))
    }

    @Test
    fun `announcer updates spoken text when narration changes`() {
        val announcer = NarrationAnnouncer()

        announcer.announce("first summary")
        assertEquals("first summary", announcer.announcement.replace("\u200B", ""))

        announcer.announce("second summary")
        assertEquals("second summary", announcer.announcement.replace("\u200B", ""))
    }
}
