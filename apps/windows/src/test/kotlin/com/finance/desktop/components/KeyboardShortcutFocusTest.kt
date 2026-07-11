// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.components

import androidx.compose.ui.input.key.Key
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Verifies that global NAVIGATION shortcuts stop hijacking editing combos like
 * Ctrl+A (Select All) while a text field is focused (#3585), while ACTION
 * shortcuts and un-focused navigation continue to fire.
 *
 * Exercises [ShortcutHandler.dispatch] — the pure focus-aware decision split out
 * of `onKeyEvent` so it can be tested without constructing platform key events.
 */
class KeyboardShortcutFocusTest {

    @BeforeTest
    fun resetFocus() {
        TextInputFocusTracker.reset()
    }

    @AfterTest
    fun tearDown() {
        TextInputFocusTracker.reset()
    }

    @Test
    fun `navigation shortcut fires when no text field is focused`() {
        val handler = ShortcutHandler()
        var fired = false
        handler.register(
            KeyboardShortcut(
                key = Key.A,
                ctrl = true,
                description = "Achievements",
                category = ShortcutCategory.NAVIGATION,
            ) { fired = true },
        )

        val consumed = handler.dispatch(Key.A, ctrl = true, shift = false)

        assertTrue(consumed)
        assertTrue(fired)
    }

    @Test
    fun `navigation shortcut is suppressed while a text field is focused`() {
        val handler = ShortcutHandler()
        var fired = false
        handler.register(
            KeyboardShortcut(
                key = Key.A,
                ctrl = true,
                description = "Achievements",
                category = ShortcutCategory.NAVIGATION,
            ) { fired = true },
        )

        TextInputFocusTracker.onFocusGained()
        val consumed = handler.dispatch(Key.A, ctrl = true, shift = false)

        // Ctrl+A must reach the focused field (Select All), not navigate.
        assertFalse(consumed)
        assertFalse(fired)
    }

    @Test
    fun `action shortcut still fires while a text field is focused`() {
        val handler = ShortcutHandler()
        var fired = false
        handler.register(
            KeyboardShortcut(
                key = Key.N,
                ctrl = true,
                shift = true,
                description = "New transaction",
                category = ShortcutCategory.ACTION,
            ) { fired = true },
        )

        TextInputFocusTracker.onFocusGained()
        val consumed = handler.dispatch(Key.N, ctrl = true, shift = true)

        assertTrue(consumed)
        assertTrue(fired)
    }

    @Test
    fun `navigation fires again after the field loses focus`() {
        val handler = ShortcutHandler()
        var count = 0
        handler.register(
            KeyboardShortcut(
                key = Key.A,
                ctrl = true,
                description = "Achievements",
                category = ShortcutCategory.NAVIGATION,
            ) { count++ },
        )

        TextInputFocusTracker.onFocusGained()
        handler.dispatch(Key.A, ctrl = true, shift = false)
        TextInputFocusTracker.onFocusLost()
        handler.dispatch(Key.A, ctrl = true, shift = false)

        assertTrue(count == 1)
    }

    @Test
    fun `nested focus requires all fields to blur before navigation resumes`() {
        TextInputFocusTracker.onFocusGained()
        TextInputFocusTracker.onFocusGained()
        TextInputFocusTracker.onFocusLost()
        assertTrue(TextInputFocusTracker.isTextInputFocused)
        TextInputFocusTracker.onFocusLost()
        assertFalse(TextInputFocusTracker.isTextInputFocused)
    }
}
