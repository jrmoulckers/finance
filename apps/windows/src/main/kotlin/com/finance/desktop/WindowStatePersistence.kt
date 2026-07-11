// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.WindowPlacement
import androidx.compose.ui.window.WindowPosition
import androidx.compose.ui.window.WindowState
import androidx.compose.ui.window.rememberWindowState
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.debounce
import java.util.prefs.Preferences

// ─────────────────────────────────────────────────────────────────────────────
// Window bounds persistence — Issue #3589
//
// Standard desktop apps restore their last window size/position and prevent the
// window from being resized so small the layout collapses. Persistence uses
// java.util.prefs.Preferences so no new dependency is introduced, and all logic
// is contained in apps/windows.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persists and restores the main window's size and position across launches.
 *
 * Values are stored under the user's [Preferences] tree. Missing or malformed
 * entries fall back to a sensible, centered default (first-run behaviour).
 */
object WindowStatePersistence {

    /** Minimum usable width; below this the sidebar + content collapse. */
    val MIN_WIDTH = 960.dp

    /** Minimum usable height. */
    val MIN_HEIGHT = 640.dp

    /** Default width on first run. */
    val DEFAULT_WIDTH = 1280.dp

    /** Default height on first run. */
    val DEFAULT_HEIGHT = 800.dp

    private const val NODE = "com/finance/desktop/window"
    private const val KEY_WIDTH = "width"
    private const val KEY_HEIGHT = "height"
    private const val KEY_X = "x"
    private const val KEY_Y = "y"
    private const val KEY_MAXIMIZED = "maximized"
    private const val UNSET = Float.MIN_VALUE

    private val prefs: Preferences get() = Preferences.userRoot().node(NODE)

    /** Snapshot of persisted window bounds. */
    data class SavedBounds(
        val size: DpSize,
        val x: Float,
        val y: Float,
        val hasPosition: Boolean,
        val maximized: Boolean,
    )

    /**
     * Loads the last-saved bounds, clamped to the minimum size. Returns `null`
     * when nothing has been persisted yet so the caller centers a default window.
     */
    fun load(): SavedBounds? {
        val p = prefs
        val width = p.getFloat(KEY_WIDTH, UNSET)
        val height = p.getFloat(KEY_HEIGHT, UNSET)
        if (width == UNSET || height == UNSET) return null

        val x = p.getFloat(KEY_X, UNSET)
        val y = p.getFloat(KEY_Y, UNSET)
        val hasPosition = x != UNSET && y != UNSET
        return SavedBounds(
            size = DpSize(
                width = maxOf(width, MIN_WIDTH.value).dp,
                height = maxOf(height, MIN_HEIGHT.value).dp,
            ),
            x = x,
            y = y,
            hasPosition = hasPosition,
            maximized = p.getBoolean(KEY_MAXIMIZED, false),
        )
    }

    /** Persists the current [state] so the next launch restores it. */
    fun save(state: WindowState) {
        val p = prefs
        val maximized = state.placement == WindowPlacement.Maximized
        p.putBoolean(KEY_MAXIMIZED, maximized)
        // Only persist size/position while in a normal (floating) placement so a
        // maximized/fullscreen session doesn't clobber the restorable bounds.
        if (!maximized && state.placement == WindowPlacement.Floating) {
            p.putFloat(KEY_WIDTH, state.size.width.value)
            p.putFloat(KEY_HEIGHT, state.size.height.value)
            val position = state.position
            if (position is WindowPosition.Absolute) {
                p.putFloat(KEY_X, position.x.value)
                p.putFloat(KEY_Y, position.y.value)
            }
        }
        p.flush()
    }
}

/**
 * Builds a [WindowState] restored from [WindowStatePersistence], falling back to
 * a centered default on first run, and continuously persists size/position and
 * placement changes (debounced to avoid thrashing the prefs store during a
 * drag/resize).
 */
@Composable
@OptIn(FlowPreview::class)
fun rememberPersistedWindowState(): WindowState {
    val saved = WindowStatePersistence.load()
    val windowState = rememberWindowState(
        size = saved?.size ?: DpSize(
            WindowStatePersistence.DEFAULT_WIDTH,
            WindowStatePersistence.DEFAULT_HEIGHT,
        ),
        position = if (saved?.hasPosition == true) {
            WindowPosition.Absolute(saved.x.dp, saved.y.dp)
        } else {
            WindowPosition(androidx.compose.ui.Alignment.Center)
        },
        placement = if (saved?.maximized == true) {
            WindowPlacement.Maximized
        } else {
            WindowPlacement.Floating
        },
    )

    LaunchedEffect(windowState) {
        snapshotFlow { Triple(windowState.size, windowState.position, windowState.placement) }
            .debounce(300)
            .collect { WindowStatePersistence.save(windowState) }
    }

    return windowState
}
