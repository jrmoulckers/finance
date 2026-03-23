// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.snapshot

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onRoot
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.finance.android.ui.screens.AppLockTimeout
import com.finance.android.ui.screens.SettingsScreen
import com.finance.android.ui.screens.SettingsUiState
import com.finance.android.ui.screens.SupportedCurrency
import com.finance.android.ui.theme.FinanceTheme
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.GraphicsMode

/** Snapshot coverage for the settings screen using Roborazzi on the JVM. */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SettingsSnapshotTest {

    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun captureSettingsScreenLight() {
        composeRule.setContent {
            SnapshotTheme(darkTheme = false) {
                SettingsScreen(
                    state = snapshotState(),
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
        composeRule.onRoot().captureRoboImage("src/test/snapshots/settings/settings-light.png")
    }

    @Test
    fun captureSettingsScreenDark() {
        composeRule.setContent {
            SnapshotTheme(darkTheme = true) {
                SettingsScreen(
                    state = snapshotState(),
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
        composeRule.onRoot().captureRoboImage("src/test/snapshots/settings/settings-dark.png")
    }

    private fun snapshotState(): SettingsUiState = SettingsUiState(
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
    )
}

@Composable
private fun SnapshotTheme(
    darkTheme: Boolean,
    content: @Composable () -> Unit,
) {
    FinanceTheme(darkTheme = darkTheme, dynamicColor = false) {
        Surface(modifier = Modifier.fillMaxSize()) {
            content()
        }
    }
}
