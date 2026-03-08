// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop

import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.WindowPosition
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState
import com.finance.desktop.components.rememberShortcutHandler

/**
 * Entry point for the Finance desktop application.
 *
 * Launches a Compose Desktop window sized for a typical desktop viewport
 * with the [FinanceApp] root composable wrapped in the Finance design-token
 * theme. Keyboard shortcuts are wired via [onPreviewKeyEvent] on the window.
 */
fun main() = application {
    val windowState = rememberWindowState(
        size = DpSize(width = 1280.dp, height = 800.dp),
        position = WindowPosition(Alignment.Center),
    )

    val shortcutHandler = rememberShortcutHandler()

    Window(
        onCloseRequest = ::exitApplication,
        title = "Finance",
        state = windowState,
        onPreviewKeyEvent = { shortcutHandler.onKeyEvent(it) },
    ) {
        FinanceApp(shortcutHandler)
    }
}
