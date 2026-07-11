// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop

import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import com.finance.desktop.components.rememberShortcutHandler
import com.finance.desktop.data.storage.UserDataPaths
import com.finance.desktop.di.SupabaseConfig
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
import java.awt.Dimension
import java.awt.GraphicsEnvironment
import javax.swing.JOptionPane
import kotlin.system.exitProcess

fun main() {
    // TODO(#2033): Wire Sentry SDK for Windows here.
    // See docs/ops/monitoring-setup.md for DSN, consent, and scrubbing requirements.
    validateStartupConfiguration()
    PerformanceTracker.recordAppStart()

    // ── One-time migration of user data out of MSI install root (#1900) ──
    // Must run BEFORE Koin starts so any module that touches DB / DPAPI key /
    // settings sees data at the new location. Idempotent and never throws.
    timed("data_migration") {
        UserDataPaths.migrateLegacyDataIfNeeded()
    }

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
        // Restore the last window size/position (or a centered default on first
        // run) and continuously persist bounds changes (#3589).
        val windowState = rememberPersistedWindowState()

        val shortcutHandler = rememberShortcutHandler()

        // Window title reflects the active screen (#3693); defaults to "Finance"
        // for auth/splash and updates to "<Screen> - Finance" once navigating.
        var windowTitle by remember { mutableStateOf("Finance") }

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
                    WindowStatePersistence.save(windowState)
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
                WindowStatePersistence.save(windowState)
                PerformanceMonitor.stop()
                systemTray.dispose()
                widgetManager.dispose()
                DesktopNotificationManager.dispose()
                stopKoin()
                exitApplication()
            },
            title = windowTitle,
            state = windowState,
            onPreviewKeyEvent = { shortcutHandler.onKeyEvent(it) },
        ) {
            // Prevent the window from shrinking below a usable size (#3589) so the
            // sidebar + content never collapse.
            LaunchedEffect(window) {
                window.minimumSize = Dimension(
                    WindowStatePersistence.MIN_WIDTH.value.toInt(),
                    WindowStatePersistence.MIN_HEIGHT.value.toInt(),
                )
            }
            FinanceApp(
                shortcutHandler,
                quickAddManager,
                systemTray,
                onTitleChange = { windowTitle = it },
            )
        }
    }
}

private fun validateStartupConfiguration() {
    try {
        SupabaseConfig.fromEnvironment()
    } catch (exception: IllegalStateException) {
        val message = exception.message ?: "Finance is missing required Supabase configuration."
        if (!GraphicsEnvironment.isHeadless()) {
            JOptionPane.showMessageDialog(
                null,
                message,
                "Finance configuration missing",
                JOptionPane.ERROR_MESSAGE,
            )
        } else {
            System.err.println(message)
        }
        exitProcess(1)
    }
}
