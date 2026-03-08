// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.accessibility

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import com.finance.android.ui.theme.FinanceTypography

/**
 * High-contrast colour schemes for users who need increased visual
 * distinction between UI elements.
 *
 * Both light and dark variants meet **WCAG 2.2 Level AAA** contrast
 * ratios (7:1 for normal text, 4.5:1 for large text) wherever feasible.
 *
 * Toggle this theme from the app's accessibility settings.
 */

// ── Light high-contrast palette ─────────────────────────────────────────

private val HighContrastLightColors: ColorScheme = lightColorScheme(
    primary = Color(0xFF00429D),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD6E3FF),
    onPrimaryContainer = Color(0xFF001B3E),
    secondary = Color(0xFF4A5578),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFDAE2FF),
    onSecondaryContainer = Color(0xFF040F33),
    tertiary = Color(0xFF5C3D00),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFFFDDB3),
    onTertiaryContainer = Color(0xFF1D1100),
    error = Color(0xFFBA1A1A),
    onError = Color.White,
    errorContainer = Color(0xFFFFDAD6),
    onErrorContainer = Color(0xFF410002),
    background = Color.White,
    onBackground = Color(0xFF0F0F0F),
    surface = Color.White,
    onSurface = Color(0xFF0F0F0F),
    surfaceVariant = Color(0xFFE0E2EC),
    onSurfaceVariant = Color(0xFF1A1C24),
    outline = Color(0xFF2E3038),
    outlineVariant = Color(0xFF44474F),
)

// ── Dark high-contrast palette ──────────────────────────────────────────

private val HighContrastDarkColors: ColorScheme = darkColorScheme(
    primary = Color(0xFFADC8FF),
    onPrimary = Color(0xFF002F65),
    primaryContainer = Color(0xFF003B7E),
    onPrimaryContainer = Color(0xFFD6E3FF),
    secondary = Color(0xFFBBC6EA),
    onSecondary = Color(0xFF1C2747),
    secondaryContainer = Color(0xFF333D5F),
    onSecondaryContainer = Color(0xFFDAE2FF),
    tertiary = Color(0xFFFFB951),
    onTertiary = Color(0xFF312000),
    tertiaryContainer = Color(0xFF472E00),
    onTertiaryContainer = Color(0xFFFFDDB3),
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005),
    errorContainer = Color(0xFF93000A),
    onErrorContainer = Color(0xFFFFDAD6),
    background = Color(0xFF0F0F0F),
    onBackground = Color(0xFFF0F0F0),
    surface = Color(0xFF0F0F0F),
    onSurface = Color(0xFFF0F0F0),
    surfaceVariant = Color(0xFF44474F),
    onSurfaceVariant = Color(0xFFE0E2EC),
    outline = Color(0xFFC4C6D0),
    outlineVariant = Color(0xFF8E9099),
)

// ── Theme composable ────────────────────────────────────────────────────

/**
 * A high-contrast Material 3 theme variant for the Finance app.
 *
 * Use this when the user has enabled the high-contrast toggle in settings.
 *
 * @param darkTheme Whether to use the dark high-contrast variant.
 * @param content   The composable content to theme.
 */
@Composable
fun HighContrastTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) HighContrastDarkColors else HighContrastLightColors

    MaterialTheme(
        colorScheme = colorScheme,
        typography = FinanceTypography,
        content = content,
    )
}

/**
 * Returns the appropriate high-contrast [ColorScheme] for the given
 * dark/light mode. Useful when you need the scheme outside of a
 * [HighContrastTheme] block (e.g. previews, tests).
 */
fun highContrastColorScheme(darkTheme: Boolean): ColorScheme =
    if (darkTheme) HighContrastDarkColors else HighContrastLightColors
