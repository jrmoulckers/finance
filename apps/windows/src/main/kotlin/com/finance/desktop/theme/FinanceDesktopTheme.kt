// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// =============================================================================
// Primitive colors — packages/design-tokens/tokens/primitive/colors.json
// =============================================================================

// region Blue
private val Blue50 = Color(0xFFEFF6FF)
private val Blue100 = Color(0xFFDBEAFE)
private val Blue200 = Color(0xFFBFDBFE)
private val Blue300 = Color(0xFF93C5FD)
private val Blue400 = Color(0xFF60A5FA)
private val Blue500 = Color(0xFF3B82F6)
private val Blue600 = Color(0xFF2563EB)
private val Blue700 = Color(0xFF1D4ED8)
private val Blue800 = Color(0xFF1E40AF)
private val Blue900 = Color(0xFF1E3A8A)
// endregion

// region Teal
private val Teal50 = Color(0xFFF0FDFA)
private val Teal100 = Color(0xFFCCFBF1)
private val Teal400 = Color(0xFF2DD4BF)
private val Teal600 = Color(0xFF0D9488)
private val Teal800 = Color(0xFF115E59)
private val Teal900 = Color(0xFF134E4A)
// endregion

// region Green
private val Green500 = Color(0xFF22C55E)
private val Green600 = Color(0xFF16A34A)
private val Green700 = Color(0xFF15803D)
// endregion

// region Amber
private val Amber50 = Color(0xFFFFFBEB)
private val Amber500 = Color(0xFFF59E0B)
private val Amber600 = Color(0xFFD97706)
private val Amber700 = Color(0xFFB45309)
// endregion

// region Red
private val Red50 = Color(0xFFFEF2F2)
private val Red400 = Color(0xFFF87171)
private val Red500 = Color(0xFFEF4444)
private val Red600 = Color(0xFFDC2626)
private val Red700 = Color(0xFFB91C1C)
private val Red900 = Color(0xFF7F1D1D)
// endregion

// region Neutral
private val Neutral0 = Color(0xFFFFFFFF)
private val Neutral50 = Color(0xFFF9FAFB)
private val Neutral100 = Color(0xFFF3F4F6)
private val Neutral200 = Color(0xFFE5E7EB)
private val Neutral300 = Color(0xFFD1D5DB)
private val Neutral400 = Color(0xFF9CA3AF)
private val Neutral500 = Color(0xFF6B7280)
private val Neutral600 = Color(0xFF4B5563)
private val Neutral700 = Color(0xFF374151)
private val Neutral800 = Color(0xFF1F2937)
private val Neutral900 = Color(0xFF111827)
private val Neutral950 = Color(0xFF030712)
// endregion

// =============================================================================
// Material 3 color schemes — mapped from design-token semantic layer
// =============================================================================

private val LightColorScheme = lightColorScheme(
    primary = Blue600,
    onPrimary = Neutral0,
    primaryContainer = Blue100,
    onPrimaryContainer = Blue900,
    secondary = Teal600,
    onSecondary = Neutral0,
    secondaryContainer = Teal100,
    onSecondaryContainer = Teal900,
    tertiary = Amber600,
    onTertiary = Neutral0,
    tertiaryContainer = Amber50,
    onTertiaryContainer = Amber700,
    error = Red600,
    onError = Neutral0,
    errorContainer = Red50,
    onErrorContainer = Red700,
    background = Neutral0,
    onBackground = Neutral900,
    surface = Neutral0,
    onSurface = Neutral900,
    surfaceVariant = Neutral100,
    onSurfaceVariant = Neutral600,
    outline = Neutral300,
    outlineVariant = Neutral200,
)

private val DarkColorScheme = darkColorScheme(
    primary = Blue400,
    onPrimary = Blue900,
    primaryContainer = Blue800,
    onPrimaryContainer = Blue100,
    secondary = Teal400,
    onSecondary = Teal900,
    secondaryContainer = Teal800,
    onSecondaryContainer = Teal100,
    tertiary = Amber500,
    onTertiary = Amber700,
    tertiaryContainer = Amber700,
    onTertiaryContainer = Amber50,
    error = Red400,
    onError = Red900,
    errorContainer = Red700,
    onErrorContainer = Red50,
    background = Neutral950,
    onBackground = Neutral50,
    surface = Neutral950,
    onSurface = Neutral50,
    surfaceVariant = Neutral800,
    onSurfaceVariant = Neutral400,
    outline = Neutral700,
    outlineVariant = Neutral700,
)

// =============================================================================
// Typography — Fluent Design uses Segoe UI (platform default on Windows)
// =============================================================================

private val FinanceTypography = Typography(
    displayLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Bold,
        fontSize = 48.sp,
        lineHeight = 60.sp,
    ),
    headlineLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.SemiBold,
        fontSize = 30.sp,
        lineHeight = 38.sp,
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
        lineHeight = 30.sp,
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 21.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 21.sp,
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 18.sp,
    ),
)

// =============================================================================
// Spacing — packages/design-tokens/tokens/primitive/spacing.json
// =============================================================================

@Immutable
data class Spacing(
    val none: Dp = 0.dp,
    val xs: Dp = 4.dp,
    val sm: Dp = 8.dp,
    val md: Dp = 12.dp,
    val lg: Dp = 16.dp,
    val xl: Dp = 20.dp,
    val xxl: Dp = 24.dp,
    val xxxl: Dp = 32.dp,
    val huge: Dp = 40.dp,
    val massive: Dp = 48.dp,
    val colossal: Dp = 64.dp,
    val epic: Dp = 80.dp,
)

val LocalSpacing = staticCompositionLocalOf { Spacing() }

// =============================================================================
// Theme composable
// =============================================================================

/**
 * Material 3 theme for the Finance Windows desktop application.
 *
 * Provides color scheme (light/dark based on system setting), typography
 * derived from the shared design tokens, and a custom [Spacing] composition
 * local accessible via [FinanceDesktopTheme.spacing].
 *
 * Typography uses [FontFamily.Default] which resolves to Segoe UI on Windows,
 * aligning with Fluent Design system conventions.
 */
@Composable
fun FinanceDesktopTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    CompositionLocalProvider(LocalSpacing provides Spacing()) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = FinanceTypography,
            content = content,
        )
    }
}

/**
 * Convenience accessor for Finance desktop design tokens.
 */
object FinanceDesktopTheme {
    val spacing: Spacing
        @Composable
        @ReadOnlyComposable
        get() = LocalSpacing.current
}
