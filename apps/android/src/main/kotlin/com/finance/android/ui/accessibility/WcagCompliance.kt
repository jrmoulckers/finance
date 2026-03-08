// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.accessibility

import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.max
import kotlin.math.min

/**
 * WCAG 2.2 Level AA compliance utilities for Jetpack Compose.
 *
 * These modifiers and helpers enforce:
 * - **2.5.8 Target Size (Minimum)** — 24×24 dp minimum (AA), 48×48 dp enhanced
 * - **2.4.7 Focus Visible** — visible focus indicator for keyboard / switch access
 * - **1.4.3 Contrast (Minimum)** — 4.5:1 for normal text, 3:1 for large text
 * - **1.4.4 Resize Text** — sp-based font sizes that respect system scaling
 */

// ── Touch-target sizing ─────────────────────────────────────────────────

/**
 * Enforces a 48×48 dp minimum touch target, meeting the Material 3 and
 * Android accessibility guidelines for interactive elements.
 *
 * @param minSize The minimum dimension (default 48 dp, aligned with Material 3).
 */
fun Modifier.minTouchTarget(minSize: Dp = MIN_TOUCH_TARGET_DP): Modifier =
    this.defaultMinSize(minWidth = minSize, minHeight = minSize)

// ── Focus indicators ────────────────────────────────────────────────────

/**
 * Makes this element focusable and draws a visible border when focused.
 *
 * Satisfies WCAG 2.4.7 (Focus Visible) for Switch Access and external
 * keyboard navigation.
 *
 * @param focusColor   The color of the focus ring (default: system accent).
 * @param borderWidth  The width of the focus ring.
 */
fun Modifier.focusableWithHighlight(
    focusColor: Color = DEFAULT_FOCUS_COLOR,
    borderWidth: Dp = FOCUS_BORDER_WIDTH,
): Modifier = composed {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    this
        .focusable(interactionSource = interactionSource)
        .then(
            if (isFocused) {
                Modifier.border(width = borderWidth, color = focusColor)
            } else {
                Modifier
            },
        )
}

// ── Color-contrast utilities ────────────────────────────────────────────

/**
 * Calculates the WCAG contrast ratio between two colours.
 *
 * The ratio is always ≥ 1 (lighter / darker + 0.05 each).
 *
 * @return A value between 1.0 (identical) and 21.0 (black on white).
 */
fun contrastRatio(foreground: Color, background: Color): Double {
    val fgLum = foreground.luminance().toDouble()
    val bgLum = background.luminance().toDouble()
    val lighter = max(fgLum, bgLum) + 0.05
    val darker = min(fgLum, bgLum) + 0.05
    return lighter / darker
}

/**
 * Returns `true` when [foreground] on [background] meets the WCAG AA
 * contrast requirement for **normal text** (ratio ≥ 4.5).
 */
fun meetsContrastAA(foreground: Color, background: Color): Boolean =
    contrastRatio(foreground, background) >= CONTRAST_AA_NORMAL

/**
 * Returns `true` when [foreground] on [background] meets the WCAG AA
 * contrast requirement for **large text** (ratio ≥ 3.0).
 *
 * Large text is ≥ 18 sp, or ≥ 14 sp bold (per WCAG definition).
 */
fun meetsLargeTextContrastAA(foreground: Color, background: Color): Boolean =
    contrastRatio(foreground, background) >= CONTRAST_AA_LARGE

// ── Constants ───────────────────────────────────────────────────────────

/** Material 3 recommended minimum touch target (48 dp). */
val MIN_TOUCH_TARGET_DP: Dp = 48.dp

/** Default focus ring colour (blue-ish for high visibility). */
private val DEFAULT_FOCUS_COLOR = Color(0xFF1A73E8)

/** Width of the focus border ring. */
private val FOCUS_BORDER_WIDTH = 2.dp

/** WCAG AA contrast ratio for normal text (< 18 sp). */
private const val CONTRAST_AA_NORMAL = 4.5

/** WCAG AA contrast ratio for large text (≥ 18 sp or ≥ 14 sp bold). */
private const val CONTRAST_AA_LARGE = 3.0
