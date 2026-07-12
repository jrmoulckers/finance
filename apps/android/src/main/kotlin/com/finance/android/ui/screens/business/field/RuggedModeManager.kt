// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.business.field

import android.content.SharedPreferences
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * App-scoped state for "Rugged field mode" (#2186).
 *
 * When enabled, transaction/category/receipt flows adopt oversized touch
 * targets and high-contrast controls so a food-truck operator can enter
 * expenses with wet, greasy, or gloved hands in bright outdoor light.
 *
 * The preference is persisted so the mode survives process death, mirroring
 * [com.finance.android.ui.accessibility.CognitiveAccessibilityManager].
 */
class RuggedModeManager(private val prefs: SharedPreferences) {

    private val _enabled = MutableStateFlow(prefs.getBoolean(KEY_ENABLED, false))

    /** Whether rugged field mode is currently active. */
    val enabled: StateFlow<Boolean> = _enabled.asStateFlow()

    fun setEnabled(value: Boolean) {
        _enabled.value = value
        prefs.edit().putBoolean(KEY_ENABLED, value).apply()
    }

    fun toggle() = setEnabled(!_enabled.value)

    /** Minimum touch-target size to use given the current mode. */
    fun touchTarget(): Dp = if (_enabled.value) RUGGED_TOUCH_TARGET else STANDARD_TOUCH_TARGET

    companion object {
        private const val KEY_ENABLED = "rugged_field_mode_enabled"

        /** WCAG 2.2 AA minimum target size. */
        val STANDARD_TOUCH_TARGET: Dp = 48.dp

        /** Oversized target for gloved/wet-hand use (#2186). */
        val RUGGED_TOUCH_TARGET: Dp = 88.dp
    }
}
