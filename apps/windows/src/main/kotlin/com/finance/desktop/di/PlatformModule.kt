// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.di

import com.finance.desktop.notifications.DesktopNotificationManager
import org.koin.dsl.module

/**
 * Koin module for Windows platform services.
 *
 * Provides DI-managed access to:
 * - [DesktopNotificationManager] — Windows toast notifications via system tray
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
}
