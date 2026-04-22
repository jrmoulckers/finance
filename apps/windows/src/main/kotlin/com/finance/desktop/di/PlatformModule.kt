// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.di

import com.finance.desktop.notifications.DesktopNotificationManager
import com.finance.desktop.voice.VoiceCommandManager
import com.finance.desktop.voice.VoiceCommandParser
import com.finance.desktop.widgets.WidgetContentRenderer
import com.finance.desktop.widgets.WidgetDataProvider
import com.finance.desktop.widgets.WidgetRegistrationManager
import org.koin.dsl.module

/**
 * Koin module for Windows platform services.
 *
 * Provides DI-managed access to:
 * - [DesktopNotificationManager] — Windows toast notifications via system tray
 * - [WidgetDataProvider] — supplies financial data to Windows 11 widget board
 * - [WidgetContentRenderer] — renders Adaptive Card JSON for widget display
 * - [WidgetRegistrationManager] — manages widget lifecycle and registration
 * - [VoiceCommandManager] — Cortana/voice command integration
 * - [VoiceCommandParser] — NLP parsing for voice transaction input
 *
 * The notification manager is provided as a singleton. Koin lifecycle
 * management ensures consistent access across all injection sites.
 *
 * Note: [DesktopNotificationManager.initialise] must still be called
 * during application startup (from Main.kt) before notifications can
 * be displayed. Koin provides the instance; the caller handles lifecycle.
 */
val platformModule = module {
    single { DesktopNotificationManager }

    // ── Windows 11 Widget Board integration ──
    single { WidgetDataProvider(get(), get(), get(), get()) }
    single { WidgetContentRenderer() }
    single { WidgetRegistrationManager(get(), get()) }

    // ── Voice / Cortana integration ──
    single { VoiceCommandManager.create() }
    single { VoiceCommandParser() }
}