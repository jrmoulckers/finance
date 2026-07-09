// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop

import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.WindowPosition
import androidx.compose.ui.window.WindowState
import java.util.prefs.Preferences

/**
 * Persists and restores the main window's size and position across launches,
 * and exposes the minimum window size the shell should enforce.
 *
 * Backed by [Preferences] (`java.util.prefs`) so no additional dependency or
 * on-disk file format is required. All reads are defensive: a missing or
 * invalid value falls back to a sensible default (centered, 1280x800).
 *
 * See issues #3589 (persist window bounds + minimum size).
 */
object WindowStatePersistence {
    private const val KEY_WIDTH = "window.width"
    private const val KEY_HEIGHT = "window.height"
    private const val KEY_X = "window.x"
    private const val KEY_Y = "window.y"

    /** Minimum window width in density-independent pixels. */
    const val MIN_WIDTH_DP: Int = 960

    /** Minimum window height in density-independent pixels. */
    const val MIN_HEIGHT_DP: Int = 640

    private val DEFAULT_SIZE = DpSize(1280.dp, 800.dp)

    private val prefs: Preferences =
        Preferences.userRoot().node("com/finance/desktop/window")

    /**
     * Restores the last persisted window size, clamped to the minimum size.
     * Falls back to [DEFAULT_SIZE] when no valid value has been stored.
     */
    fun loadSize(): DpSize {
        val width = prefs.getFloat(KEY_WIDTH, -1f)
        val height = prefs.getFloat(KEY_HEIGHT, -1f)
        if (width <= 0f || height <= 0f) return DEFAULT_SIZE
        return DpSize(
            width.coerceAtLeast(MIN_WIDTH_DP.toFloat()).dp,
            height.coerceAtLeast(MIN_HEIGHT_DP.toFloat()).dp,
        )
    }

    /**
     * Restores the last persisted window position, or centers the window when
     * no absolute position has been stored.
     */
    fun loadPosition(): WindowPosition {
        val x = prefs.getFloat(KEY_X, Float.NaN)
        val y = prefs.getFloat(KEY_Y, Float.NaN)
        if (x.isNaN() || y.isNaN()) return WindowPosition(Alignment.Center)
        return WindowPosition(x.dp, y.dp)
    }

    /**
     * Persists the current window [state]. Only absolute positions are stored;
     * aligned/default positions are ignored so the next launch can re-center.
     */
    fun save(state: WindowState) {
        val size = state.size
        if (size.width.value > 0f && size.height.value > 0f) {
            prefs.putFloat(KEY_WIDTH, size.width.value)
            prefs.putFloat(KEY_HEIGHT, size.height.value)
        }
        val position = state.position
        if (position is WindowPosition.Absolute) {
            prefs.putFloat(KEY_X, position.x.value)
            prefs.putFloat(KEY_Y, position.y.value)
        }
    }
}
