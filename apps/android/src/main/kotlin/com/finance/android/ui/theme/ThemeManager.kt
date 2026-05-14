// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.theme

import android.content.SharedPreferences
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import timber.log.Timber

/**
 * Manages custom theme personalization beyond Material You defaults.
 *
 * Provides reactive state for:
 * - Custom accent color selection
 * - Font size scaling beyond system defaults
 * - High contrast mode
 * - Dynamic color toggle (Material You on/off)
 *
 * All settings are persisted to [SharedPreferences] and observed via
 * [StateFlow] so the entire UI tree recomposes when theme changes.
 *
 * @param prefs App's [SharedPreferences] instance.
 */
class ThemeManager(private val prefs: SharedPreferences) {

    internal companion object {
        const val KEY_ACCENT_COLOR = "theme_accent_color"
        const val KEY_FONT_SCALE = "theme_font_scale"
        const val KEY_DYNAMIC_COLOR = "theme_dynamic_color"
        const val KEY_HIGH_CONTRAST = "theme_high_contrast"
        const val KEY_THEME_MODE = "theme_mode"

        /** Default accent color — Finance primary blue. */
        const val DEFAULT_ACCENT_COLOR = 0xFF1565C0.toInt()
    }

    private val _accentColor = MutableStateFlow(
        Color(prefs.getInt(KEY_ACCENT_COLOR, DEFAULT_ACCENT_COLOR)),
    )

    /** Custom accent color as a reactive [StateFlow]. */
    val accentColor: StateFlow<Color> = _accentColor.asStateFlow()

    private val _fontScale = MutableStateFlow(
        prefs.getFloat(KEY_FONT_SCALE, 1.0f),
    )

    /** Font scale multiplier (1.0 = system default). */
    val fontScale: StateFlow<Float> = _fontScale.asStateFlow()

    private val _dynamicColorEnabled = MutableStateFlow(
        prefs.getBoolean(KEY_DYNAMIC_COLOR, true),
    )

    /** Whether Material You dynamic colors are enabled. */
    val dynamicColorEnabled: StateFlow<Boolean> = _dynamicColorEnabled.asStateFlow()

    private val _highContrastEnabled = MutableStateFlow(
        prefs.getBoolean(KEY_HIGH_CONTRAST, false),
    )

    /** Whether high contrast mode is active. */
    val highContrastEnabled: StateFlow<Boolean> = _highContrastEnabled.asStateFlow()

    private val _themeMode = MutableStateFlow(
        ThemeMode.fromString(prefs.getString(KEY_THEME_MODE, ThemeMode.SYSTEM.name)),
    )

    /** Current theme mode (light/dark/system). */
    val themeMode: StateFlow<ThemeMode> = _themeMode.asStateFlow()

    /**
     * Updates the custom accent color.
     *
     * @param color The new accent color.
     */
    fun setAccentColor(color: Color) {
        prefs.edit().putInt(KEY_ACCENT_COLOR, color.toArgb()).apply()
        _accentColor.value = color
        Timber.d("Accent color updated")
    }

    /**
     * Updates the font scale multiplier.
     *
     * @param scale Value between 0.8 and 2.0.
     */
    fun setFontScale(scale: Float) {
        val clamped = scale.coerceIn(0.8f, 2.0f)
        prefs.edit().putFloat(KEY_FONT_SCALE, clamped).apply()
        _fontScale.value = clamped
        Timber.d("Font scale updated to %.1f", clamped)
    }

    /**
     * Enables or disables Material You dynamic colors.
     */
    fun setDynamicColorEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_DYNAMIC_COLOR, enabled).apply()
        _dynamicColorEnabled.value = enabled
        Timber.d("Dynamic color: %s", enabled)
    }

    /**
     * Enables or disables high contrast mode.
     */
    fun setHighContrastEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_HIGH_CONTRAST, enabled).apply()
        _highContrastEnabled.value = enabled
        Timber.d("High contrast: %s", enabled)
    }

    /**
     * Sets the theme mode (light/dark/system).
     */
    fun setThemeMode(mode: ThemeMode) {
        prefs.edit().putString(KEY_THEME_MODE, mode.name).apply()
        _themeMode.value = mode
        Timber.d("Theme mode: %s", mode.name)
    }

    /**
     * Resets all theme preferences to defaults.
     */
    fun resetToDefaults() {
        setAccentColor(Color(DEFAULT_ACCENT_COLOR))
        setFontScale(1.0f)
        setDynamicColorEnabled(true)
        setHighContrastEnabled(false)
        setThemeMode(ThemeMode.SYSTEM)
        Timber.i("Theme preferences reset to defaults")
    }
}

/**
 * Theme display mode.
 */
enum class ThemeMode(val displayName: String) {
    SYSTEM("Follow system"),
    LIGHT("Always light"),
    DARK("Always dark");

    companion object {
        /** Parses a [ThemeMode] from a stored string, defaulting to [SYSTEM]. */
        fun fromString(value: String?): ThemeMode {
            return entries.firstOrNull { it.name == value } ?: SYSTEM
        }
    }
}
