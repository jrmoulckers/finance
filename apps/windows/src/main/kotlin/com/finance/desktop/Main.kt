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
import com.finance.desktop.di.appModules
import com.finance.desktop.notifications.DesktopNotificationManager
import com.finance.desktop.performance.PerformanceMonitor
import com.finance.desktop.performance.PerformanceTracker
import com.finance.desktop.performance.timed
import com.finance.desktop.tray.FinanceSystemTray
import com.finance.desktop.tray.QuickAddTransactionManager
import com.finance.desktop.tray.TrayActionHandler
import com.finance.desktop.widgets.WidgetRegistrationManager
import org.koin.core.context.GlobalContext
import org.koin.core.context.startKoin
import org.koin.core.context.stopKoin

fun main() {
    PerformanceTracker.recordAppStart()

    timed("koin_init") {
        startKoin {
            modules(appModules)
        }
    }

    timed("notifications_init") {
        DesktopNotificationManager.initialise()
    }

    // Initialise Windows 11 Widget Board integration
    val widgetManager = GlobalContext.get().get<WidgetRegistrationManager>()
    timed("widget_init") {
        widgetManager.initialize()
    }

    // Initialise system tray integration
    val systemTray = GlobalContext.get().get<FinanceSystemTray>()
    val quickAddManager = GlobalContext.get().get<QuickAddTransactionManager>()

    // Start background performance monitoring
    PerformanceMonitor.start()
    PerformanceTracker.recordFirstInteractive()

    application {
        val windowState = rememberWindowState(
            size = DpSize(width = 1280.dp, height = 800.dp),
            position = WindowPosition(Alignment.Center),
        )

        val shortcutHandler = rememberShortcutHandler()

        // Initialise tray with action handler
        timed("tray_init") {
            systemTray.initialise(
                handler = object : TrayActionHandler {
                    override fun onQuickAddTransaction() {
                        quickAddManager.show()
                    }

                    override fun onOpenApp() {
                        // Bring window to front (WindowState is managed by Compose)
                        windowState.isMinimized = false
                    }

                    override fun onShowSummary() {
                        systemTray.showDailySummary()
                    }
                },
                onQuit = {
                    PerformanceMonitor.stop()
                    systemTray.dispose()
                    widgetManager.dispose()
                    DesktopNotificationManager.dispose()
                    stopKoin()
                    exitApplication()
                },
            )
        }

        Window(
            onCloseRequest = {
                PerformanceMonitor.stop()
                systemTray.dispose()
                widgetManager.dispose()
                DesktopNotificationManager.dispose()
                stopKoin()
                exitApplication()
            },
            title = "Finance",
            state = windowState,
            onPreviewKeyEvent = { shortcutHandler.onKeyEvent(it) },
        ) {
            FinanceApp(shortcutHandler, quickAddManager, systemTray)
        }
    }
}
