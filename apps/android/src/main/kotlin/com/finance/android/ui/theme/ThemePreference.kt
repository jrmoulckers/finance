// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.theme

import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import timber.log.Timber

/**
 * User-selectable theme mode.
 *
 * [SYSTEM] follows the device's dark/light setting (Material You default).
 * [LIGHT] forces light theme regardless of system setting.
 * [DARK] forces dark theme regardless of system setting.
 */
enum class ThemePreference(val label: String) {
    SYSTEM("Follow system"),
    LIGHT("Light"),
    DARK("Dark"),
}

/**
 * Manages the persisted theme preference with reactive observation.
 *
 * Exposes a [StateFlow] so that [MainActivity] and [SettingsViewModel]
 * can reactively observe theme changes without polling. Backed by
 * [SharedPreferences] for consistency with the existing settings
 * persistence layer.
 *
 * Provided as a Koin singleton so that all consumers share the same
 * reactive state.
 *
 * @param prefs The app's [SharedPreferences] instance (same one used
 *   by [SettingsViewModel] for other settings).
 */
class ThemePreferenceManager(private val prefs: SharedPreferences) {

    internal companion object {
        /** SharedPreferences key for the theme preference. */
        const val KEY_THEME = "theme_preference"

        /** SharedPreferences key for the high-contrast toggle. */
        const val KEY_HIGH_CONTRAST = "high_contrast_enabled"
    }

    private val _themePreference = MutableStateFlow(readPreference())

    /** Current theme preference as a reactive [StateFlow]. */
    val themePreference: StateFlow<ThemePreference> = _themePreference.asStateFlow()

    private val _highContrastEnabled = MutableStateFlow(
        prefs.getBoolean(KEY_HIGH_CONTRAST, false),
    )

    /** Whether high-contrast mode is active, as a reactive [StateFlow]. */
    val highContrastEnabled: StateFlow<Boolean> = _highContrastEnabled.asStateFlow()

    /**
     * Updates the theme preference.
     *
     * Persists to [SharedPreferences] and emits the new value on
     * [themePreference] so all observers update synchronously.
     */
    fun setThemePreference(preference: ThemePreference) {
        prefs.edit().putString(KEY_THEME, preference.name).apply()
        _themePreference.value = preference
        Timber.d("Theme preference updated to %s", preference.name)
    }

    /**
     * Updates the high-contrast mode setting.
     *
     * Persists to [SharedPreferences] and emits the new value on
     * [highContrastEnabled] so all observers (including [FinanceTheme])
     * update synchronously.
     */
    fun setHighContrastEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_HIGH_CONTRAST, enabled).apply()
        _highContrastEnabled.value = enabled
        Timber.d("High contrast mode updated to %s", enabled)
    }

    private fun readPreference(): ThemePreference {
        return prefs.getString(KEY_THEME, null)
            ?.let { name -> ThemePreference.entries.firstOrNull { it.name == name } }
            ?: ThemePreference.SYSTEM
    }
}
