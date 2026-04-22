// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.finance.desktop.components.ShortcutHandler
import com.finance.desktop.di.koinGet
import com.finance.desktop.navigation.Screen
import com.finance.desktop.navigation.SidebarNavigation
import com.finance.desktop.screens.AccountsScreen
import com.finance.desktop.screens.BudgetsScreen
import com.finance.desktop.screens.DashboardScreen
import com.finance.desktop.screens.DiagnosticsScreen
import com.finance.desktop.screens.GoalsScreen
import com.finance.desktop.screens.LockScreen
import com.finance.desktop.screens.SettingsScreen
import com.finance.desktop.screens.TransactionsScreen
import com.finance.desktop.screens.VoiceTransactionOverlay
import com.finance.desktop.screens.WidgetBoardScreen
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.AuthViewModel

/**
 * Root composable for the Finance Windows desktop application.
 *
 * Applies [FinanceDesktopTheme] (Material 3 with design-token colors) and
 * gates access behind Windows Hello authentication when configured. Once
 * authenticated, renders the sidebar navigation shell with all core screens.
 * The [VoiceTransactionOverlay] is layered on top for voice-driven transaction
 * entry (activated via Ctrl+Shift+V).
 *
 * ## Authentication Flow
 *
 * 1. [AuthViewModel] checks Windows Hello availability and stored credentials
 * 2. If authentication is required, [LockScreen] is shown
 * 3. User authenticates via Windows Hello (biometric → PIN fallback)
 * 4. On success, the main app content is rendered
 * 5. Auto-lock returns to the lock screen after inactivity
 *
 * @param shortcutHandler The [ShortcutHandler] wired to the application
 *   window's [onPreviewKeyEvent], enabling Ctrl+1 through Ctrl+6 shortcuts.
 */
@Composable
fun FinanceApp(shortcutHandler: ShortcutHandler) {
    val authViewModel = koinGet<AuthViewModel>()
    val authState by authViewModel.uiState.collectAsState()

    FinanceDesktopTheme {
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .semantics { contentDescription = "Finance application" },
            color = MaterialTheme.colorScheme.background,
        ) {
            if (authState.requiresAuth && !authState.isAuthenticated) {
                // Lock screen — gate access to financial data
                LockScreen(
                    isAuthenticating = authState.isAuthenticating,
                    isWindowsHelloAvailable = authState.isWindowsHelloAvailable,
                    authError = authState.authError,
                    onAuthenticate = { authViewModel.authenticate() },
                    onSkip = { authViewModel.skipAuth() },
                )
            } else {
                // Main app — authenticated or auth not required
                Box(modifier = Modifier.fillMaxSize()) {
                    SidebarNavigation(shortcutHandler = shortcutHandler) { screen ->
                        when (screen) {
                            Screen.Dashboard -> DashboardScreen()
                            Screen.Accounts -> AccountsScreen()
                            Screen.Transactions -> TransactionsScreen()
                            Screen.Budgets -> BudgetsScreen()
                            Screen.Goals -> GoalsScreen()
                            Screen.Widgets -> WidgetBoardScreen()
                            Screen.Diagnostics -> DiagnosticsScreen()
                            Screen.Settings -> SettingsScreen()
                        }
                    }

                    // Voice transaction overlay — rendered on top of all content
                    VoiceTransactionOverlay()
                }
            }
        }
    }
}
