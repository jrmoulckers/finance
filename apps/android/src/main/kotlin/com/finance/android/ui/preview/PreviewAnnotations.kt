// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.preview

import android.content.res.Configuration
import androidx.compose.ui.tooling.preview.Preview

/**
 * Reusable multi-configuration preview annotations for the Finance app.
 *
 * These annotations combine common preview configurations so individual
 * screens and components can be annotated with a single annotation instead
 * of repeating [Preview] parameters.
 *
 * ## Usage
 * ```kotlin
 * @ThemePreviews
 * @Composable
 * fun MyComponentPreview() { ... }
 * ```
 *
 * This generates light + dark previews automatically.
 */

// ── Theme Previews (Light + Dark) ───────────────────────────────────

/**
 * Generates both light and dark theme previews.
 * Use on any composable that should be verified in both themes.
 */
@Preview(
    name = "Light",
    showBackground = true,
    uiMode = Configuration.UI_MODE_NIGHT_NO,
)
@Preview(
    name = "Dark",
    showBackground = true,
    uiMode = Configuration.UI_MODE_NIGHT_YES,
)
annotation class ThemePreviews

// ── Full Screen Previews (Light + Dark with system UI) ──────────────

/**
 * Generates full-screen light and dark previews with system UI chrome.
 * Use for screen-level composables that fill the viewport.
 */
@Preview(
    name = "Screen – Light",
    showBackground = true,
    showSystemUi = true,
    uiMode = Configuration.UI_MODE_NIGHT_NO,
)
@Preview(
    name = "Screen – Dark",
    showBackground = true,
    showSystemUi = true,
    uiMode = Configuration.UI_MODE_NIGHT_YES,
)
annotation class ScreenPreviews

// ── Device Previews (Phone + Tablet) ────────────────────────────────

/**
 * Generates previews across device form factors:
 * - Phone (default)
 * - Foldable (7-inch, 1080×2480)
 * - Tablet (10-inch, landscape)
 *
 * Use for screens that should adapt to different screen sizes.
 */
@Preview(
    name = "Phone",
    showBackground = true,
    showSystemUi = true,
    device = "spec:width=411dp,height=891dp,dpi=420",
)
@Preview(
    name = "Foldable",
    showBackground = true,
    showSystemUi = true,
    device = "spec:width=673dp,height=841dp,dpi=420",
)
@Preview(
    name = "Tablet",
    showBackground = true,
    showSystemUi = true,
    device = "spec:width=1280dp,height=800dp,dpi=240",
)
annotation class DevicePreviews

// ── Accessibility Previews ──────────────────────────────────────────

/**
 * Generates previews with accessibility-relevant configurations:
 * - Default font scale (1.0×)
 * - Large font scale (1.5×)
 * - Extra-large font scale (2.0×)
 *
 * Use to verify layout integrity with TalkBack-like font scaling.
 */
@Preview(
    name = "Font 1.0×",
    showBackground = true,
    fontScale = 1.0f,
)
@Preview(
    name = "Font 1.5×",
    showBackground = true,
    fontScale = 1.5f,
)
@Preview(
    name = "Font 2.0×",
    showBackground = true,
    fontScale = 2.0f,
)
annotation class FontScalePreviews

// ── Comprehensive Previews ──────────────────────────────────────────

/**
 * Maximum coverage preview: light, dark, and large font.
 * Use on key screens that must work across all configurations.
 */
@Preview(
    name = "Light",
    showBackground = true,
    showSystemUi = true,
    uiMode = Configuration.UI_MODE_NIGHT_NO,
)
@Preview(
    name = "Dark",
    showBackground = true,
    showSystemUi = true,
    uiMode = Configuration.UI_MODE_NIGHT_YES,
)
@Preview(
    name = "Large Font",
    showBackground = true,
    showSystemUi = true,
    fontScale = 1.5f,
)
annotation class ComprehensivePreviews
