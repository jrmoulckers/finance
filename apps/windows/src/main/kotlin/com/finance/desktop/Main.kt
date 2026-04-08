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
import com.finance.desktop.di.appModule
import org.koin.core.context.startKoin

fun main() {
    startKoin {
        modules(appModule)
    }

    application {
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
}
