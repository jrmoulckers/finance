package com.finance.desktop.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.type

/**
 * Represents a keyboard shortcut binding.
 *
 * @param key The [Key] to match.
 * @param ctrl Whether Ctrl must be held. Defaults to `true` (most desktop shortcuts use Ctrl).
 * @param shift Whether Shift must be held. Defaults to `false`.
 * @param description Human-readable label for accessibility and tooltip display.
 * @param action The callback to invoke when the shortcut is triggered.
 */
@Stable
data class KeyboardShortcut(
    val key: Key,
    val ctrl: Boolean = true,
    val shift: Boolean = false,
    val description: String,
    val action: () -> Unit,
)

/**
 * Registry that collects [KeyboardShortcut]s and dispatches incoming [KeyEvent]s.
 *
 * Create an instance via [rememberShortcutHandler] inside a composable scope,
 * then wire [onKeyEvent] into a window or root modifier `onPreviewKeyEvent`.
 */
@Stable
class ShortcutHandler {
    private val shortcuts = mutableListOf<KeyboardShortcut>()

    /** Register a shortcut. Duplicates (same key combo) are replaced. */
    fun register(shortcut: KeyboardShortcut) {
        shortcuts.removeAll {
            it.key == shortcut.key && it.ctrl == shortcut.ctrl && it.shift == shortcut.shift
        }
        shortcuts.add(shortcut)
    }

    /** Unregister all shortcuts with the given [key]. */
    fun unregister(key: Key) {
        shortcuts.removeAll { it.key == key }
    }

    /** Clear every registered shortcut. */
    fun clear() {
        shortcuts.clear()
    }

    /** Returns all currently-registered shortcuts (for tooltip / help display). */
    fun allShortcuts(): List<KeyboardShortcut> = shortcuts.toList()

    /**
     * Attempt to handle a [KeyEvent]. Returns `true` if the event was consumed.
     *
     * Call this from `onPreviewKeyEvent` on the application [Window] so that
     * shortcuts fire before any child composable consumes the event.
     */
    fun onKeyEvent(event: KeyEvent): Boolean {
        if (event.type != KeyEventType.KeyDown) return false
        val match = shortcuts.firstOrNull { shortcut ->
            event.key == shortcut.key &&
                event.isCtrlPressed == shortcut.ctrl &&
                event.isShiftPressed == shortcut.shift
        }
        if (match != null) {
            match.action()
            return true
        }
        return false
    }
}

/**
 * Creates and remembers a [ShortcutHandler] that is cleared when the
 * composable leaves the composition.
 */
@Composable
fun rememberShortcutHandler(): ShortcutHandler {
    val handler = remember { ShortcutHandler() }
    DisposableEffect(Unit) {
        onDispose { handler.clear() }
    }
    return handler
}

/**
 * Composable that registers a set of [KeyboardShortcut]s on the provided
 * [ShortcutHandler] for the lifetime of the composition.
 *
 * Place this inside the composable tree — shortcuts are automatically
 * unregistered when the composable is removed.
 *
 * Usage:
 * ```
 * KeyboardShortcutEffect(handler) {
 *     listOf(
 *         KeyboardShortcut(Key.One, description = "Dashboard") { navigateTo(Screen.Dashboard) },
 *         KeyboardShortcut(Key.Two, description = "Accounts") { navigateTo(Screen.Accounts) },
 *     )
 * }
 * ```
 */
@Composable
fun KeyboardShortcutEffect(
    handler: ShortcutHandler,
    shortcuts: () -> List<KeyboardShortcut>,
) {
    val bindings = remember(shortcuts) { shortcuts() }
    DisposableEffect(bindings) {
        bindings.forEach { handler.register(it) }
        onDispose {
            bindings.forEach { handler.unregister(it.key) }
        }
    }
}
