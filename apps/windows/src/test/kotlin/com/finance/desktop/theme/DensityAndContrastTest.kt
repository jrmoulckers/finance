// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.theme

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Unit tests for the density spacing scales (#3722) and the high-contrast
 * resolution logic (#3665). Pure logic — no Compose runtime involved.
 */
class DensityAndContrastTest {

    @Test
    fun `compact spacing is strictly denser than comfortable for key tokens`() {
        assertTrue(CompactSpacing.xs.value < ComfortableSpacing.xs.value)
        assertTrue(CompactSpacing.sm.value < ComfortableSpacing.sm.value)
        assertTrue(CompactSpacing.md.value < ComfortableSpacing.md.value)
        assertTrue(CompactSpacing.lg.value < ComfortableSpacing.lg.value)
        assertTrue(CompactSpacing.xxl.value < ComfortableSpacing.xxl.value)
        assertTrue(CompactSpacing.epic.value < ComfortableSpacing.epic.value)
    }

    @Test
    fun `compact spacing keeps a sane monotonic scale`() {
        assertTrue(CompactSpacing.xs.value <= CompactSpacing.sm.value)
        assertTrue(CompactSpacing.sm.value <= CompactSpacing.md.value)
        assertTrue(CompactSpacing.md.value <= CompactSpacing.lg.value)
        assertTrue(CompactSpacing.lg.value <= CompactSpacing.xxl.value)
        assertTrue(CompactSpacing.none.value == 0f)
    }

    @Test
    fun `high contrast mode parses stored strings and defaults to auto`() {
        assertEquals(HighContrastMode.ON, HighContrastMode.fromStorage("On"))
        assertEquals(HighContrastMode.OFF, HighContrastMode.fromStorage("off"))
        assertEquals(HighContrastMode.AUTO, HighContrastMode.fromStorage("AUTO"))
        assertEquals(HighContrastMode.AUTO, HighContrastMode.fromStorage(null))
        assertEquals(HighContrastMode.AUTO, HighContrastMode.fromStorage("garbage"))
    }

    @Test
    fun `resolveHighContrast honours explicit user choice over system state`() {
        assertTrue(resolveHighContrast(HighContrastMode.ON, systemDetected = false))
        assertFalse(resolveHighContrast(HighContrastMode.OFF, systemDetected = true))
    }

    @Test
    fun `resolveHighContrast follows system when auto`() {
        assertTrue(resolveHighContrast(HighContrastMode.AUTO, systemDetected = true))
        assertFalse(resolveHighContrast(HighContrastMode.AUTO, systemDetected = false))
    }
}
