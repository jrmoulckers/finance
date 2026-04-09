// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.snapshot

import com.finance.android.ui.screens.AppLockTimeout
import com.finance.android.ui.screens.SettingsScreen
import com.finance.android.ui.screens.SettingsUiState
import com.finance.android.ui.screens.SupportedCurrency
import com.finance.android.ui.theme.ThemePreference
import org.junit.Rule
import org.junit.Test

/**
 * Paparazzi snapshot tests for the Settings screen.
 *
 * Captures golden images for the full settings screen with all sections
 * (Profile, Appearance, Preferences, Security, Accessibility, Data, About)
 * in light/dark/high-contrast modes at 1.0× and 2.0× font scales.
 */
class SettingsSnapshotTest {

    @get:Rule
    val paparazzi = SnapshotTestConfig.paparazzi()

    private fun sampleState() = SettingsUiState(
        userName = "Alex Johnson",
        userEmail = "alex@example.com",
        themePreference = ThemePreference.SYSTEM,
        defaultCurrency = SupportedCurrency.USD,
        notificationsEnabled = true,
        billRemindersEnabled = false,
        biometricEnabled = true,
        biometricAvailable = true,
        appLockTimeout = AppLockTimeout.ONE_MINUTE,
        simplifiedViewEnabled = false,
        highContrastEnabled = false,
        appVersion = "1.0.0",
    )

    /** No-op callback for all settings actions. */
    @Suppress("LongMethod")
    private fun renderSettings(themeMode: ThemeMode, fontScale: FontScale) {
        paparazzi.snapshot {
            SnapshotThemeWrapper(themeMode, fontScale) {
                SettingsScreen(
                    state = sampleState(),
                    onNavigateBack = {},
                    onSignOut = {},
                    onSetThemePreference = {},
                    onSetCurrency = {},
                    onSetNotifications = {},
                    onSetBillReminders = {},
                    onSetBiometric = {},
                    onSetAppLockTimeout = {},
                    onSetSimplifiedView = {},
                    onSetHighContrast = {},
                    onExportClick = {},
                    onDeleteClick = {},
                    onExportFormat = {},
                    onDismissExportDialog = {},
                    onDeleteTextChanged = {},
                    onConfirmDelete = {},
                    onDismissDeleteDialog = {},
                )
            }
        }
    }

    @Test
    fun settings_light_1x() = renderSettings(ThemeMode.LIGHT, FontScale.NORMAL)

    @Test
    fun settings_dark_1x() = renderSettings(ThemeMode.DARK, FontScale.NORMAL)

    @Test
    fun settings_highContrast_1x() = renderSettings(ThemeMode.HIGH_CONTRAST, FontScale.NORMAL)

    @Test
    fun settings_light_2x() = renderSettings(ThemeMode.LIGHT, FontScale.LARGE)

    @Test
    fun settings_dark_2x() = renderSettings(ThemeMode.DARK, FontScale.LARGE)

    @Test
    fun settings_highContrast_2x() = renderSettings(ThemeMode.HIGH_CONTRAST, FontScale.LARGE)
}
