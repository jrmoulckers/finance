// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.snapshot

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onRoot
import com.finance.android.ui.screens.AppLockTimeout
import com.finance.android.ui.screens.SettingsScreen
import com.finance.android.ui.screens.SettingsUiState
import com.finance.android.ui.screens.SupportedCurrency
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.GraphicsMode

/** Snapshot coverage for the settings screen using Roborazzi on the JVM. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SettingsSnapshotTest {

    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun captureSettingsScreenLight() {
        composeRule.setContent {
            SnapshotTheme(darkTheme = false) {
                SettingsScreen(
                    state = SettingsUiState(
                        userName = "Alex Johnson",
                        userEmail = "alex@example.com",
                        defaultCurrency = SupportedCurrency.USD,
                        notificationsEnabled = true,
                        billRemindersEnabled = false,
                        biometricEnabled = true,
                        biometricAvailable = true,
                        appLockTimeout = AppLockTimeout.ONE_MINUTE,
                        simplifiedViewEnabled = false,
                        highContrastEnabled = false,
                        appVersion = "1.0.0",
                    ),
                    onNavigateBack = {},
                    onSignOut = {},
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

        composeRule.waitForIdle()
        composeRule.onRoot().captureRoboImage(snapshotFilePath("settings/settings-light.png"))
    }

    @Test
    fun captureSettingsScreenDark() {
        composeRule.setContent {
            SnapshotTheme(darkTheme = true) {
                SettingsScreen(
                    state = SettingsUiState(
                        userName = "Alex Johnson",
                        userEmail = "alex@example.com",
                        defaultCurrency = SupportedCurrency.USD,
                        notificationsEnabled = true,
                        billRemindersEnabled = false,
                        biometricEnabled = true,
                        biometricAvailable = true,
                        appLockTimeout = AppLockTimeout.ONE_MINUTE,
                        simplifiedViewEnabled = false,
                        highContrastEnabled = false,
                        appVersion = "1.0.0",
                    ),
                    onNavigateBack = {},
                    onSignOut = {},
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

        composeRule.waitForIdle()
        composeRule.onRoot().captureRoboImage(snapshotFilePath("settings/settings-dark.png"))
    }
}
