// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.components

import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.InternalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.asComposeCanvas
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.scene.CanvasLayersComposeScene
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import kotlinx.coroutines.Dispatchers
import org.jetbrains.skia.Surface
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

// An offscreen scene exercises actual text editing without a UI-test dependency.
@OptIn(ExperimentalComposeUiApi::class, InternalComposeUiApi::class)
class TextEditingShortcutTest {
    @Test
    fun `select all reaches an editable field without opt-in focus tracking`() {
        TextInputFocusTracker.reset()
        var navigated = false
        var actionInvoked = false
        val handler = ShortcutHandler()
        handler.register(
            KeyboardShortcut(
                Key.A,
                description = "Navigate to Achievements",
                category = ShortcutCategory.NAVIGATION,
            ) { navigated = true },
        )
        handler.register(
            KeyboardShortcut(Key.N, shift = true, description = "New transaction") {
                actionInvoked = true
            },
        )
        val field = mutableStateOf(TextFieldValue("Synthetic search"))
        val focus = FocusRequester()
        val nonEditorFocus = FocusRequester()
        val surface = Surface.makeRasterN32Premul(640, 480)
        val scene = CanvasLayersComposeScene(coroutineContext = Dispatchers.Unconfined)
        try {
            scene.setContent {
                Box(
                    Modifier.onKeyEvent(handler::onKeyEvent)
                        .focusRequester(nonEditorFocus)
                        .focusable(),
                ) {
                    BasicTextField(
                        value = field.value,
                        onValueChange = { field.value = it },
                        modifier = Modifier.focusRequester(focus),
                    )
                }
            }
            scene.render(surface.canvas.asComposeCanvas(), 0)
            focus.requestFocus()
            scene.render(surface.canvas.asComposeCanvas(), 1)
            assertFalse(TextInputFocusTracker.isTextInputFocused)

            scene.sendKeyEvent(
                KeyEvent(
                    key = Key.A,
                    type = KeyEventType.KeyDown,
                    isCtrlPressed = true,
                ),
            )

            assertFalse(navigated, "Ctrl+A must not navigate away from the editor")
            assertEquals(TextRange(0, field.value.text.length), field.value.selection)

            scene.sendKeyEvent(
                KeyEvent(Key.N, KeyEventType.KeyDown, isCtrlPressed = true, isShiftPressed = true),
            )
            assertTrue(actionInvoked, "Unconsumed action shortcuts must still work while editing")

            nonEditorFocus.requestFocus()
            scene.sendKeyEvent(KeyEvent(Key.A, KeyEventType.KeyDown, isCtrlPressed = true))
            assertTrue(navigated, "Navigation shortcuts must still work outside an editor")
        } finally {
            scene.close()
            surface.close()
            TextInputFocusTracker.reset()
        }
    }
}
