// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.snapshot

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.android.ide.common.rendering.api.SessionParams
import com.finance.android.ui.theme.FinanceTheme

/**
 * Shared Paparazzi configuration for snapshot tests.
 *
 * Provides consistent device config, theme modes, and font-scale
 * variants across all screen snapshot tests.
 */
object SnapshotTestConfig {

    /** Default device config matching Pixel 6 at 1080×2400 (xxhdpi). */
    val defaultDevice: DeviceConfig = DeviceConfig.PIXEL_6

    /** Standard Paparazzi rule builder with consistent rendering settings. */
    fun paparazzi(): Paparazzi = Paparazzi(
        deviceConfig = defaultDevice,
        renderingMode = SessionParams.RenderingMode.NORMAL,
        showSystemUi = false,
        maxPercentDifference = 0.1,
    )
}

/**
 * Enumeration of theme modes tested per screen.
 */
enum class ThemeMode(
    val displayName: String,
    val darkTheme: Boolean,
    val highContrast: Boolean,
) {
    LIGHT("light", darkTheme = false, highContrast = false),
    DARK("dark", darkTheme = true, highContrast = false),
    HIGH_CONTRAST("high-contrast", darkTheme = false, highContrast = true),
}

/**
 * Enumeration of font scales tested per screen.
 */
enum class FontScale(
    val displayName: String,
    val scale: Float,
) {
    NORMAL("1.0x", 1.0f),
    LARGE("2.0x", 2.0f),
}

/**
 * Wraps composable [content] in [FinanceTheme] with the specified
 * theme mode and font scale, inside a [Surface] for correct background.
 *
 * Dynamic color is disabled so snapshots are deterministic across environments.
 */
@Composable
fun SnapshotThemeWrapper(
    themeMode: ThemeMode,
    fontScale: FontScale,
    content: @Composable () -> Unit,
) {
    val currentDensity = LocalDensity.current
    val scaledDensity = Density(
        density = currentDensity.density,
        fontScale = fontScale.scale,
    )
    CompositionLocalProvider(LocalDensity provides scaledDensity) {
        FinanceTheme(
            darkTheme = themeMode.darkTheme,
            highContrast = themeMode.highContrast,
            dynamicColor = false,
        ) {
            Surface(modifier = Modifier.fillMaxSize()) {
                content()
            }
        }
    }
}
