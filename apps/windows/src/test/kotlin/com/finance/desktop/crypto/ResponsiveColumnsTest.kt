// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.crypto

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Unit tests for the pure responsive-layout logic ([DashboardLayout]).
 *
 * These pin the breakpoint → tier → column-count mapping that drives the
 * ultrawide adaptive grid, with no Compose involved.
 */
class ResponsiveColumnsTest {

    @Test
    fun `width maps to the correct tier at and around each boundary`() {
        assertEquals(LayoutTier.MOBILE, DashboardLayout.tierForWidth(0))
        assertEquals(LayoutTier.MOBILE, DashboardLayout.tierForWidth(639))
        assertEquals(LayoutTier.TABLET, DashboardLayout.tierForWidth(640))
        assertEquals(LayoutTier.TABLET, DashboardLayout.tierForWidth(1023))
        assertEquals(LayoutTier.DESKTOP, DashboardLayout.tierForWidth(1024))
        assertEquals(LayoutTier.DESKTOP, DashboardLayout.tierForWidth(1439))
        assertEquals(LayoutTier.WIDESCREEN, DashboardLayout.tierForWidth(1440))
        assertEquals(LayoutTier.WIDESCREEN, DashboardLayout.tierForWidth(3440))
    }

    @Test
    fun `summary columns grow with the tier`() {
        assertEquals(1, DashboardLayout.summaryColumns(LayoutTier.MOBILE))
        assertEquals(2, DashboardLayout.summaryColumns(LayoutTier.TABLET))
        assertEquals(3, DashboardLayout.summaryColumns(LayoutTier.DESKTOP))
        assertEquals(4, DashboardLayout.summaryColumns(LayoutTier.WIDESCREEN))
    }

    @Test
    fun `holdings columns use ultrawide width`() {
        assertEquals(1, DashboardLayout.holdingsColumns(500))
        assertEquals(2, DashboardLayout.holdingsColumns(800))
        assertEquals(3, DashboardLayout.holdingsColumns(1200))
        assertEquals(4, DashboardLayout.holdingsColumns(2560))
    }

    @Test
    fun `multi-panel layout only engages at desktop width and above`() {
        assertFalse(DashboardLayout.isMultiPanel(639))
        assertFalse(DashboardLayout.isMultiPanel(1023))
        assertTrue(DashboardLayout.isMultiPanel(1024))
        assertTrue(DashboardLayout.isMultiPanel(3440))
    }

    @Test
    fun `holdings panel weight is a valid fraction and leaves room for the rail`() {
        listOf(1024, 1440, 2560, 3440).forEach { width ->
            val weight = DashboardLayout.holdingsPanelWeight(width)
            assertTrue(weight > 0f && weight < 1f, "weight out of range for $width: $weight")
        }
        // Ultrawide gives the context rail slightly more room than plain desktop.
        assertTrue(
            DashboardLayout.holdingsPanelWeight(2560) < DashboardLayout.holdingsPanelWeight(1200),
        )
    }
}
