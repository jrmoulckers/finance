// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.finance.desktop.components.ShortcutHandler
import com.finance.desktop.navigation.Screen
import com.finance.desktop.navigation.SidebarNavigation
import com.finance.desktop.screens.AccountsScreen
import com.finance.desktop.screens.BudgetsScreen
import com.finance.desktop.screens.DashboardScreen
import com.finance.desktop.screens.GoalsScreen
import com.finance.desktop.screens.SettingsScreen
import com.finance.desktop.screens.TransactionsScreen
import com.finance.desktop.theme.FinanceDesktopTheme

/**
 * Root composable for the Finance Windows desktop application.
 *
 * Applies [FinanceDesktopTheme] (Material 3 with design-token colors) and
 * renders the sidebar navigation shell with all core screens.
 *
 * @param shortcutHandler The [ShortcutHandler] wired to the application
 *   window's [onPreviewKeyEvent], enabling Ctrl+1 through Ctrl+6 shortcuts.
 */
@Composable
fun FinanceApp(shortcutHandler: ShortcutHandler) {
    FinanceDesktopTheme {
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .semantics { contentDescription = "Finance application" },
            color = MaterialTheme.colorScheme.background,
        ) {
            SidebarNavigation(shortcutHandler = shortcutHandler) { screen ->
                when (screen) {
                    Screen.Dashboard -> DashboardScreen()
                    Screen.Accounts -> AccountsScreen()
                    Screen.Transactions -> TransactionsScreen()
                    Screen.Budgets -> BudgetsScreen()
                    Screen.Goals -> GoalsScreen()
                    Screen.Settings -> SettingsScreen()
                }
            }
        }
    }
}
