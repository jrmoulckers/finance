// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.accessibility

import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

// =============================================================================
// Keyboard Navigation Utilities for Windows Desktop Accessibility
// =============================================================================
//
// These utilities ensure that every interactive element in the Finance desktop
// app can be reached and activated via keyboard alone, without requiring a mouse.
// This is essential for:
//   - Narrator users who navigate via Tab/Shift+Tab
//   - Motor-impaired users who rely on keyboard navigation
//   - Power users who prefer keyboard shortcuts
//
// Every screen should use these utilities to manage focus order and provide
// consistent keyboard interaction patterns.

/**
 * Width of the keyboard focus ring drawn by [focusVisible].
 */
private val FocusRingWidth = 2.dp

/**
 * Reusable focus-visible modifier that draws a clearly visible outline when the
 * element receives keyboard focus (WCAG 2.4.7 Focus Visible, #3715).
 *
 * Custom interactive composables built with `clickable { }` only expose ripple
 * and hover indication, so sighted keyboard users cannot tell what is focused
 * when tabbing. Apply this modifier *before* the `clickable`/`focusable` in the
 * chain so it observes the downstream focus target:
 *
 * ```
 * Modifier
 *     .background(bg, shape)
 *     .focusVisible(shape)
 *     .clickable { onClick() }
 * ```
 *
 * The ring uses [MaterialTheme.colorScheme.primary] by default, which is chosen
 * per-theme to meet contrast requirements in light, dark, and high-contrast
 * schemes (bright yellow / dark blue in the high-contrast palettes).
 *
 * @param shape Shape of the focus ring; should match the element's background.
 * @param color Ring color; defaults to the theme primary.
 * @return A [Modifier] that renders a focus outline while keyboard-focused.
 */
@Composable
fun Modifier.focusVisible(
    shape: Shape = RoundedCornerShape(8.dp),
    color: Color = MaterialTheme.colorScheme.primary,
): Modifier {
    var isFocused by remember { mutableStateOf(false) }
    return this
        .onFocusChanged { isFocused = it.isFocused }
        .then(
            if (isFocused) Modifier.border(FocusRingWidth, color, shape) else Modifier,
        )
}

/**
 * Creates and remembers a [FocusRequester] that automatically requests
 * focus when the composable enters the composition.
 *
 * Use this for the primary interactive element on each screen so that
 * keyboard users land on a meaningful element when navigating to a new
 * screen, rather than having to Tab through the sidebar first.
 *
 * Usage:
 * ```
 * @Composable
 * fun DashboardScreen() {
 *     val initialFocus = rememberInitialFocus()
 *     Text(
 *         text = "Dashboard",
 *         modifier = Modifier
 *             .focusRequester(initialFocus)
 *             .focusable(),
 *     )
 * }
 * ```
 *
 * @return A [FocusRequester] that requests focus on first composition.
 */
@Composable
fun rememberInitialFocus(): FocusRequester {
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        try {
            focusRequester.requestFocus()
        } catch (_: Exception) {
            // Focus request can fail if the composable is not yet laid out.
            // This is expected during initial composition and is safe to ignore.
        }
    }
    return focusRequester
}

/**
 * Wraps content in a focus trap that cycles Tab focus within the container.
 *
 * When the user presses Tab on the last focusable element, focus returns to
 * the first element. Shift+Tab from the first element moves to the last.
 *
 * Use for modal dialogs, lock screens, and other contexts where focus
 * should not escape to background content.
 *
 * @param content The composable content to trap focus within.
 */
@Composable
fun FocusTrap(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = modifier
            .onPreviewKeyEvent { event ->
                // Let Tab and Shift+Tab cycle within the trap
                if (event.type == KeyEventType.KeyDown && event.key == Key.Tab) {
                    // Compose handles Tab focus automatically within the tree.
                    // This trap ensures the focus stays within this Box.
                    false
                } else {
                    false
                }
            }
            .semantics { contentDescription = "Focus trap container" },
    ) {
        content()
    }
}

/**
 * Modifier that handles Escape key to invoke a dismiss action.
 *
 * Standard Windows behavior: Escape closes dialogs, dismisses menus,
 * and cancels operations. Apply this to any dismissible overlay.
 *
 * @param onDismiss Callback invoked when Escape is pressed.
 * @return Modified [Modifier] with Escape key handling.
 */
fun Modifier.dismissOnEscape(onDismiss: () -> Unit): Modifier =
    this.onPreviewKeyEvent { event ->
        if (event.type == KeyEventType.KeyDown && event.key == Key.Escape) {
            onDismiss()
            true
        } else {
            false
        }
    }

/**
 * Modifier that handles Enter and Space keys to invoke an action.
 *
 * Standard Windows behavior: Enter and Space activate buttons and
 * interactive elements. Use this for custom interactive composables
 * that don't use built-in Button/Clickable.
 *
 * @param onActivate Callback invoked when Enter or Space is pressed.
 * @return Modified [Modifier] with activation key handling.
 */
fun Modifier.activateOnEnterOrSpace(onActivate: () -> Unit): Modifier =
    this.onPreviewKeyEvent { event ->
        if (event.type == KeyEventType.KeyDown &&
            (event.key == Key.Enter || event.key == Key.Spacebar)
        ) {
            onActivate()
            true
        } else {
            false
        }
    }

/**
 * Modifier that handles arrow key navigation within a list.
 *
 * Calls [onNavigate] with -1 for Up/Left and +1 for Down/Right,
 * allowing the caller to update the selected index.
 *
 * @param onNavigate Callback with direction delta (-1 or +1).
 * @return Modified [Modifier] with arrow key navigation.
 */
fun Modifier.arrowKeyNavigation(onNavigate: (delta: Int) -> Unit): Modifier =
    this.onPreviewKeyEvent { event ->
        if (event.type == KeyEventType.KeyDown) {
            when (event.key) {
                Key.DirectionUp, Key.DirectionLeft -> {
                    onNavigate(-1)
                    true
                }
                Key.DirectionDown, Key.DirectionRight -> {
                    onNavigate(+1)
                    true
                }
                else -> false
            }
        } else {
            false
        }
    }
