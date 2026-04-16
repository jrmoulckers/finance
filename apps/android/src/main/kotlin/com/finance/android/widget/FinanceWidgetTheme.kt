// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.widget

import androidx.compose.runtime.Composable
import androidx.glance.GlanceTheme
import androidx.glance.material3.ColorProviders
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import com.finance.android.ui.theme.Amber50
import com.finance.android.ui.theme.Amber500
import com.finance.android.ui.theme.Amber600
import com.finance.android.ui.theme.Amber700
import com.finance.android.ui.theme.Blue100
import com.finance.android.ui.theme.Blue400
import com.finance.android.ui.theme.Blue600
import com.finance.android.ui.theme.Blue800
import com.finance.android.ui.theme.Blue900
import com.finance.android.ui.theme.Neutral0
import com.finance.android.ui.theme.Neutral100
import com.finance.android.ui.theme.Neutral200
import com.finance.android.ui.theme.Neutral300
import com.finance.android.ui.theme.Neutral400
import com.finance.android.ui.theme.Neutral50
import com.finance.android.ui.theme.Neutral600
import com.finance.android.ui.theme.Neutral700
import com.finance.android.ui.theme.Neutral800
import com.finance.android.ui.theme.Neutral900
import com.finance.android.ui.theme.Neutral950
import com.finance.android.ui.theme.Red400
import com.finance.android.ui.theme.Red50
import com.finance.android.ui.theme.Red600
import com.finance.android.ui.theme.Red700
import com.finance.android.ui.theme.Red900
import com.finance.android.ui.theme.Teal100
import com.finance.android.ui.theme.Teal400
import com.finance.android.ui.theme.Teal600
import com.finance.android.ui.theme.Teal800
import com.finance.android.ui.theme.Teal900

/**
 * Glance widget color scheme using the Finance design token palette.
 *
 * On Android 12+ (API 31+), [GlanceTheme] automatically uses dynamic colors
 * from the user's wallpaper (Material You). On older devices, the static
 * Finance color scheme is used as a fallback.
 *
 * Uses [ColorProviders] with both light and dark schemes so widgets adapt
 * to the system theme setting.
 */
object FinanceWidgetTheme {

    private val LightColors = lightColorScheme(
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

    private val DarkColors = darkColorScheme(
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
     * Color provider for Glance widgets.
     *
     * Supplies both light and dark schemes so the widget adapts to the
     * current system appearance.
     */
    val colors = ColorProviders(
        light = LightColors,
        dark = DarkColors,
    )
}

/**
 * Wraps widget content in the Finance [GlanceTheme] with Material You support.
 *
 * @param content The Glance composable content to theme.
 */
@Composable
fun FinanceGlanceTheme(
    content: @Composable () -> Unit,
) {
    GlanceTheme(colors = FinanceWidgetTheme.colors) {
        content()
    }
}
