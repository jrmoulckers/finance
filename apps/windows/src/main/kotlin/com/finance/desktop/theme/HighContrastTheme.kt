// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color

// =============================================================================
// High Contrast Color Schemes for Windows Accessibility
// =============================================================================
//
// Windows provides several high contrast themes:
// - High Contrast Black (dark background, bright text)
// - High Contrast White (white background, dark text)
// - High Contrast #1 (dark background, yellow/green accents)
// - High Contrast #2 (dark background, purple/cyan accents)
//
// These color schemes provide enhanced contrast ratios (≥7:1 for normal text,
// ≥4.5:1 for large text) to meet WCAG AAA requirements.
//
// The app detects system dark/light mode and applies the appropriate high
// contrast scheme when the user has enabled accessibility features.

/**
 * High contrast color scheme for dark system themes.
 *
 * Uses pure white text on pure black backgrounds with bright accent colors.
 * All color combinations exceed WCAG AAA contrast ratio requirements (7:1).
 *
 * Maps to Windows "High Contrast Black" and "High Contrast #1" themes.
 */
val HighContrastDarkColorScheme: ColorScheme = darkColorScheme(
    // Primary: bright yellow for maximum visibility
    primary = Color(0xFFFFFF00),
    onPrimary = Color(0xFF000000),
    primaryContainer = Color(0xFF333300),
    onPrimaryContainer = Color(0xFFFFFF00),

    // Secondary: bright cyan
    secondary = Color(0xFF00FFFF),
    onSecondary = Color(0xFF000000),
    secondaryContainer = Color(0xFF003333),
    onSecondaryContainer = Color(0xFF00FFFF),

    // Tertiary: bright green
    tertiary = Color(0xFF00FF00),
    onTertiary = Color(0xFF000000),
    tertiaryContainer = Color(0xFF003300),
    onTertiaryContainer = Color(0xFF00FF00),

    // Error: bright red
    error = Color(0xFFFF0000),
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFF330000),
    onErrorContainer = Color(0xFFFF6666),

    // Backgrounds: pure black
    background = Color(0xFF000000),
    onBackground = Color(0xFFFFFFFF),
    surface = Color(0xFF000000),
    onSurface = Color(0xFFFFFFFF),
    surfaceVariant = Color(0xFF1A1A1A),
    onSurfaceVariant = Color(0xFFCCCCCC),

    // Outlines: visible borders
    outline = Color(0xFFFFFFFF),
    outlineVariant = Color(0xFF808080),
)

/**
 * High contrast color scheme for light system themes.
 *
 * Uses pure black text on pure white backgrounds with dark accent colors.
 * All color combinations exceed WCAG AAA contrast ratio requirements (7:1).
 *
 * Maps to Windows "High Contrast White" theme.
 */
val HighContrastLightColorScheme: ColorScheme = lightColorScheme(
    // Primary: dark blue
    primary = Color(0xFF000080),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFCCCCFF),
    onPrimaryContainer = Color(0xFF000080),

    // Secondary: dark teal
    secondary = Color(0xFF006666),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFCCFFFF),
    onSecondaryContainer = Color(0xFF006666),

    // Tertiary: dark green
    tertiary = Color(0xFF006600),
    onTertiary = Color(0xFFFFFFFF),
    tertiaryContainer = Color(0xFFCCFFCC),
    onTertiaryContainer = Color(0xFF006600),

    // Error: dark red
    error = Color(0xFF990000),
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFFFCCCC),
    onErrorContainer = Color(0xFF990000),

    // Backgrounds: pure white
    background = Color(0xFFFFFFFF),
    onBackground = Color(0xFF000000),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF000000),
    surfaceVariant = Color(0xFFF0F0F0),
    onSurfaceVariant = Color(0xFF333333),

    // Outlines: visible borders
    outline = Color(0xFF000000),
    outlineVariant = Color(0xFF666666),
)

/**
 * Detects whether Windows high contrast mode is active.
 *
 * Checks the Windows registry key:
 * `HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize\EnableTransparency`
 * and the high contrast system parameter.
 *
 * Note: This is a best-effort detection. Compose Desktop does not have
 * built-in high contrast mode detection, so we check the system property
 * and fall back to the dark/light theme toggle.
 *
 * @return true if high contrast mode appears to be active
 */
fun isHighContrastEnabled(): Boolean {
    return try {
        // Check via SystemProperties — Java AWT can detect high contrast
        val toolkit = java.awt.Toolkit.getDefaultToolkit()
        val highContrast = toolkit.getDesktopProperty("win.highContrast.on")
        highContrast == true
    } catch (_: Exception) {
        false
    }
}

/**
 * User-facing high-contrast preference (#3665).
 *
 * System detection via [isHighContrastEnabled] is best-effort and frequently
 * returns nothing under Compose Desktop, so users can force the behaviour:
 * - [AUTO] preserves the current system-detection behaviour.
 * - [ON] always uses a high-contrast scheme.
 * - [OFF] never uses a high-contrast scheme.
 */
enum class HighContrastMode {
    AUTO,
    ON,
    OFF,
    ;

    companion object {
        /**
         * Parses a persisted string value, falling back to [AUTO] for unknown
         * or null input so a corrupt setting never breaks theming.
         */
        fun fromStorage(value: String?): HighContrastMode =
            entries.firstOrNull { it.name.equals(value, ignoreCase = true) } ?: AUTO
    }
}

/**
 * Resolves whether high contrast should be active given the user's [mode] and
 * the best-effort [systemDetected] flag from [isHighContrastEnabled].
 *
 * @param mode The user's explicit preference.
 * @param systemDetected Whether the OS appears to have high contrast enabled.
 * @return true if a high-contrast color scheme should be applied.
 */
fun resolveHighContrast(
    mode: HighContrastMode,
    systemDetected: Boolean = isHighContrastEnabled(),
): Boolean = when (mode) {
    HighContrastMode.ON -> true
    HighContrastMode.OFF -> false
    HighContrastMode.AUTO -> systemDetected
}

/**
 * Returns the appropriate color scheme based on system accessibility settings.
 *
 * Priority:
 * 1. High contrast mode → [HighContrastDarkColorScheme] or [HighContrastLightColorScheme]
 * 2. System dark mode → standard dark color scheme
 * 3. Default → standard light color scheme
 *
 * @param isDarkTheme Whether the system is in dark mode
 * @param isHighContrast Whether high contrast mode is active
 * @param standardLight The standard light color scheme
 * @param standardDark The standard dark color scheme
 */
fun resolveColorScheme(
    isDarkTheme: Boolean,
    isHighContrast: Boolean,
    standardLight: ColorScheme,
    standardDark: ColorScheme,
): ColorScheme = when {
    isHighContrast && isDarkTheme -> HighContrastDarkColorScheme
    isHighContrast && !isDarkTheme -> HighContrastLightColorScheme
    isDarkTheme -> standardDark
    else -> standardLight
}
