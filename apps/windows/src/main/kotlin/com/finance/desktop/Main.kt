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
import com.finance.desktop.notifications.DesktopNotificationManager
import org.koin.core.context.startKoin
import org.koin.core.context.stopKoin

fun main() {
    startKoin {
        modules(appModule)
    }

    DesktopNotificationManager.initialise()

    application {
        val windowState = rememberWindowState(
            size = DpSize(width = 1280.dp, height = 800.dp),
            position = WindowPosition(Alignment.Center),
        )

        val shortcutHandler = rememberShortcutHandler()

        Window(
            onCloseRequest = {
                DesktopNotificationManager.dispose()
                stopKoin()
                exitApplication()
            },
            title = "Finance",
            state = windowState,
            onPreviewKeyEvent = { shortcutHandler.onKeyEvent(it) },
        ) {
            FinanceApp(shortcutHandler)
        }
    }
}
