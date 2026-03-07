package com.finance.android.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Finance Material 3 color schemes.
 *
 * Fallback colors are mapped from the design-token semantic layer:
 *   - Light: packages/design-tokens/tokens/semantic/colors.light.json
 *   - Dark:  packages/design-tokens/tokens/semantic/colors.dark.json
 *
 * On Android 12+ (API 31+) dynamic colors from the user's wallpaper are used
 * instead of these static schemes (Material You).
 */

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

/**
 * Material 3 type scale for Finance.
 *
 * Mapped from packages/design-tokens/tokens/semantic/typography.json:
 *   display  → displayLarge  (48 sp, bold, tight)
 *   headline → headlineLarge (30 sp, semibold, tight)
 *   title    → titleLarge    (20 sp, semibold, normal)
 *   body     → bodyLarge     (16 sp, regular, normal)
 *   label    → labelLarge    (14 sp, medium, normal)
 *   caption  → labelSmall    (12 sp, regular, normal)
 */
val FinanceTypography = Typography(
    displayLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Bold,
        fontSize = 48.sp,
        lineHeight = 60.sp, // 48 × 1.25 (tight)
    ),
    headlineLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.SemiBold,
        fontSize = 30.sp,
        lineHeight = 38.sp, // 30 × 1.25 (tight)
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
        lineHeight = 30.sp, // 20 × 1.5 (normal)
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp, // 16 × 1.5 (normal)
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 21.sp, // 14 × 1.5 (normal)
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 21.sp, // 14 × 1.5 (normal)
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 18.sp, // 12 × 1.5 (normal)
    ),
)

/**
 * Top-level Material 3 theme for the Finance app.
 *
 * Provides [MaterialTheme] color scheme, typography, and a custom [Spacing]
 * composition local accessible via [FinanceTheme.spacing].
 *
 * @param darkTheme Whether to use the dark color scheme.
 * @param dynamicColor Whether to use Android 12+ dynamic colors (Material You).
 * @param content The composable content to theme.
 */
@Composable
fun FinanceTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit,
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }

    CompositionLocalProvider(LocalSpacing provides Spacing()) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = FinanceTypography,
            content = content,
        )
    }
}

/**
 * Convenience accessor for Finance design tokens within a themed tree.
 */
object FinanceTheme {
    /**
     * The current [Spacing] values provided by [FinanceTheme].
     */
    val spacing: Spacing
        @Composable
        @ReadOnlyComposable
        get() = LocalSpacing.current
}
