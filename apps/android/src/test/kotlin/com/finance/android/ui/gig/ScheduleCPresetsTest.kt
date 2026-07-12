// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.gig

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Unit tests for [ScheduleCPresets] gig quick-add presets (#2141). */
class ScheduleCPresetsTest {

    @Test
    fun `presets are non-empty and have unique keys`() {
        val keys = ScheduleCPresets.presets.map { it.key }
        assertTrue(keys.isNotEmpty())
        assertEquals(keys.size, keys.toSet().size, "preset keys must be unique")
    }

    @Test
    fun `every preset references a Schedule C line and has a note`() {
        ScheduleCPresets.presets.forEach { preset ->
            assertTrue(preset.scheduleCLine.contains("Schedule C") || preset.scheduleCLine.contains("Part"))
            assertTrue(preset.note.isNotBlank())
            assertTrue(preset.label.isNotBlank())
        }
    }

    @Test
    fun `byKey resolves known keys and null for unknown`() {
        assertEquals("Gas / fuel", ScheduleCPresets.byKey("car_gas")?.label)
        assertNull(ScheduleCPresets.byKey("does_not_exist"))
        assertNull(ScheduleCPresets.byKey(null))
    }

    @Test
    fun `noteFor appends platform when provided`() {
        val preset = ScheduleCPresets.byKey("car_gas")!!
        assertEquals(preset.note, ScheduleCPresets.noteFor(preset))
        assertEquals("${preset.note} · Uber", ScheduleCPresets.noteFor(preset, GigPlatform.UBER))
    }

    @Test
    fun `noteFor omits the OTHER catch-all platform`() {
        val preset = ScheduleCPresets.byKey("car_gas")!!
        assertEquals(preset.note, ScheduleCPresets.noteFor(preset, GigPlatform.OTHER))
    }
}
