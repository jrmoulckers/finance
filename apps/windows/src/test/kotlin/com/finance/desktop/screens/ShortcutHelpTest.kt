// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.ui.input.key.Key
import com.finance.desktop.components.KeyboardShortcut
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Unit tests for the derived keyboard-shortcuts help content (#3660).
 *
 * These pin the key-formatting and section-grouping logic so the help dialog
 * always reflects the real registered shortcuts, with no phantom entries.
 */
class ShortcutHelpTest {

    private fun shortcut(
        key: Key,
        description: String,
        ctrl: Boolean = true,
        shift: Boolean = false,
    ) = KeyboardShortcut(key = key, ctrl = ctrl, shift = shift, description = description, action = {})

    @Test
    fun `formatShortcutKeys renders modifiers in order`() {
        assertEquals("Ctrl+Shift+N", formatShortcutKeys(shortcut(Key.N, "New transaction", ctrl = true, shift = true)))
        assertEquals("Ctrl+D", formatShortcutKeys(shortcut(Key.D, "Go to dashboard")))
        assertEquals("F1", formatShortcutKeys(shortcut(Key.F1, "Show shortcuts", ctrl = false)))
        assertEquals("Escape", formatShortcutKeys(shortcut(Key.Escape, "Close dialog", ctrl = false)))
    }

    @Test
    fun `sections split navigation from actions and rewrite nav labels`() {
        val shortcuts = listOf(
            shortcut(Key.D, "Navigate to Dashboard"),
            shortcut(Key.T, "Navigate to Transactions"),
            shortcut(Key.N, "New transaction", shift = true),
            shortcut(Key.F1, "Show keyboard shortcuts", ctrl = false),
        )

        val sections = buildShortcutHelpSections(shortcuts)

        assertEquals(listOf("Navigation", "Actions"), sections.map { it.first })

        val nav = sections.first { it.first == "Navigation" }.second
        assertTrue(nav.any { it.description == "Go to Dashboard" })
        assertTrue(nav.any { it.description == "Go to Transactions" })

        val actions = sections.first { it.first == "Actions" }.second
        assertTrue(actions.any { it.description == "New transaction" })
        assertTrue(actions.any { it.description == "Show keyboard shortcuts" })
    }

    @Test
    fun `duplicate key combos are collapsed`() {
        val shortcuts = listOf(
            shortcut(Key.N, "New transaction", shift = true),
            shortcut(Key.N, "New transaction", shift = true),
        )
        val actions = buildShortcutHelpSections(shortcuts).first { it.first == "Actions" }.second
        assertEquals(1, actions.size)
    }

    @Test
    fun `empty shortcut list yields no sections`() {
        assertTrue(buildShortcutHelpSections(emptyList()).isEmpty())
    }
}
