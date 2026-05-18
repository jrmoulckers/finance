// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.finance.desktop.components.ShortcutHandler
import com.finance.desktop.di.koinGet
import com.finance.desktop.navigation.Screen
import com.finance.desktop.navigation.SidebarNavigation
import com.finance.desktop.screens.AccountsScreen
import com.finance.desktop.screens.BudgetNegotiationScreen
import com.finance.desktop.screens.BudgetsScreen
import com.finance.desktop.screens.CurrencyConversionScreen
import com.finance.desktop.screens.DashboardScreen
import com.finance.desktop.screens.DiagnosticsScreen
import com.finance.desktop.screens.GamificationScreen
import com.finance.desktop.screens.GoalsScreen
import com.finance.desktop.screens.HealthScoreScreen
import com.finance.desktop.screens.LockScreen
import com.finance.desktop.screens.ReportBuilderScreen
import com.finance.desktop.screens.QuickAddTransactionDialog
import com.finance.desktop.screens.SettingsScreen
import com.finance.desktop.screens.TipsScreen
import com.finance.desktop.screens.TransactionsScreen
import com.finance.desktop.screens.UpgradeScreen
import com.finance.desktop.screens.VoiceTransactionOverlay
import com.finance.desktop.screens.WidgetBoardScreen
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.tray.FinanceSystemTray
import com.finance.desktop.tray.QuickAddTransactionManager
import com.finance.desktop.screens.auth.LoginScreen
import com.finance.desktop.screens.gdpr.GdprConsentDialog
import com.finance.desktop.data.repository.AuthRepository
import com.finance.desktop.viewmodel.AuthViewModel
import com.finance.desktop.viewmodel.GdprConsentViewModel

/**
 * Root composable for the Finance Windows desktop application.
 *
 * Applies [FinanceDesktopTheme] (Material 3 with design-token colors) and
 * gates access behind Windows Hello authentication when configured. Once
 * authenticated, renders the sidebar navigation shell with all core screens.
 * The [VoiceTransactionOverlay] is layered on top for voice-driven transaction
 * entry (activated via Ctrl+Shift+V). The [QuickAddTransactionDialog] is
 * triggered from the system tray context menu.
 *
 * ## Authentication Guard
 *
 * The auth guard ensures that authenticated users never see login/signup
 * screens. During startup a splash/loading screen is shown while the auth
 * state resolves, preventing any flash of the login screen. If a deep link
 * points to login/signup while authenticated, the user is redirected to the
 * dashboard.
 *
 * ## Authentication Flow
 *
 * 1. Show loading splash while auth state resolves
 * 2. [AuthViewModel] checks Windows Hello availability and stored credentials
 * 3. [AuthRepository.isAuthenticated] is consulted for session-level auth
 * 4. If authenticated (session or Windows Hello), go directly to dashboard
 * 5. If authentication is required, [LockScreen] is shown
 * 6. User authenticates via Windows Hello (biometric → PIN fallback)
 * 7. On success, the main app content is rendered
 * 8. Auto-lock returns to the lock screen after inactivity
 *
 * @param shortcutHandler The [ShortcutHandler] wired to the application
 *   window's [onPreviewKeyEvent], enabling Ctrl+1 through Ctrl+8 shortcuts.
 * @param quickAddManager Manager for system tray quick-add transaction.
 * @param systemTray The system tray integration for notifications.
 */
@Composable
@Suppress("CyclomaticComplexMethod") // Top-level navigation routing composable
fun FinanceApp(
    shortcutHandler: ShortcutHandler,
    quickAddManager: QuickAddTransactionManager,
    systemTray: FinanceSystemTray,
) {
    val authViewModel = koinGet<AuthViewModel>()
    val authState by authViewModel.uiState.collectAsState()
    val authRepository = koinGet<AuthRepository>()
    val sessionAuthenticated by authRepository.isAuthenticated.collectAsState()
    val gdprViewModel = koinGet<GdprConsentViewModel>()
    val gdprState by gdprViewModel.uiState.collectAsState()

    FinanceDesktopTheme {
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .semantics { contentDescription = "Finance application" },
            color = MaterialTheme.colorScheme.background,
        ) {
            // ── Layer 0: Splash screen while auth state resolves ──
            // Prevents flash of login screen during startup
            if (authState.isAuthenticating && !authState.isAuthenticated && !sessionAuthenticated) {
                SplashLoadingScreen()
                return@Surface
            }

            // ── Layer 1: GDPR consent dialog (first run) ──
            if (gdprState.showConsentDialog) {
                GdprConsentDialog(
                    onAcceptAll = { gdprViewModel.acceptAll() },
                    onAcceptRequired = { gdprViewModel.acceptRequiredOnly() },
                    onCustomize = { analytics, crash ->
                        gdprViewModel.customizeConsent(analytics, crash)
                    },
                )
                return@Surface
            }

            // ── Auth Guard: If user has an active session, always show main app ──
            // This ensures deep links to login/signup are redirected to dashboard
            val isFullyAuthenticated = authState.isAuthenticated || sessionAuthenticated

            if (!isFullyAuthenticated && authState.requiresAuth) {
                // ── Layer 2: Auth gate — only shown when NOT authenticated ──
                if (authState.isWindowsHelloAvailable) {
                    // Windows Hello lock screen
                    LockScreen(
                        isAuthenticating = authState.isAuthenticating,
                        isWindowsHelloAvailable = authState.isWindowsHelloAvailable,
                        authError = authState.authError,
                        onAuthenticate = { authViewModel.authenticate() },
                        onSkip = { authViewModel.skipAuth() },
                    )
                } else {
                    // Email/password login
                    LoginScreen(
                        onAuthenticated = { authViewModel.skipAuth() },
                    )
                }
            } else {
                // ── Layer 3: Main app — authenticated ──
                Box(modifier = Modifier.fillMaxSize()) {
                    SidebarNavigation(shortcutHandler = shortcutHandler) { screen ->
                        when (screen) {
                            Screen.Dashboard -> DashboardScreen()
                            Screen.Accounts -> AccountsScreen()
                            Screen.Transactions -> TransactionsScreen()
                            Screen.Budgets -> BudgetsScreen()
                            Screen.Goals -> GoalsScreen()
                            Screen.Widgets -> WidgetBoardScreen()
                            Screen.Upgrade -> UpgradeScreen()
                            Screen.Tips -> TipsScreen()
                            Screen.Investments -> {} // placeholder
                            Screen.Household -> {} // placeholder
                            Screen.Achievements -> GamificationScreen()
                            Screen.Diagnostics -> DiagnosticsScreen()
                            Screen.HealthScore -> HealthScoreScreen()
                            Screen.Reports -> ReportBuilderScreen()
                            Screen.QuickAdd -> {} // handled by dialog
                            Screen.Import -> {} // placeholder
                            Screen.Referral -> {} // placeholder
                            Screen.Negotiate -> BudgetNegotiationScreen()
                            Screen.Currency -> CurrencyConversionScreen()
                            Screen.Settings -> SettingsScreen()
                        }
                    }

                    // Voice transaction overlay — rendered on top of all content
                    VoiceTransactionOverlay()

                    // Quick-add transaction dialog — triggered from system tray
                    QuickAddTransactionDialog(
                        quickAddManager = quickAddManager,
                        systemTray = systemTray,
                    )
                }
            }
        }
    }
}

/**
 * Splash/loading screen shown during auth state resolution.
 *
 * Prevents any flash of login/signup screens while the auth system
 * determines whether the user has an active session.
 */
@Composable
private fun SplashLoadingScreen() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .semantics { contentDescription = "Loading Finance application" },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(
                modifier = Modifier.size(48.dp),
                color = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = "Finance",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onBackground,
            )
        }
    }
}
