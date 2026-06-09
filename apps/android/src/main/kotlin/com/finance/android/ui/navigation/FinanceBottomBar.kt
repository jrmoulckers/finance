@file:Suppress("MatchingDeclarationName") // File contains multiple related declarations

// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.navigation

import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import com.finance.android.ui.components.IconView
import com.finance.core.icons.IconToken

/**
 * Describes a top-level destination shown in the bottom navigation bar.
 */
enum class TopLevelDestination(
    val route: String,
    val iconToken: IconToken,
    val label: String,
    val a11yDescription: String,
) {
    Dashboard(
        route = Route.Dashboard.route,
        iconToken = IconToken.DASHBOARD,
        label = "Dashboard",
        a11yDescription = "Navigate to Dashboard",
    ),
    Transactions(
        route = Route.Transactions.route,
        iconToken = IconToken.TRANSACTIONS,
        label = "Activity",
        a11yDescription = "View transaction activity",
    ),
    Planning(
        route = Route.Planning.route,
        iconToken = IconToken.BUDGETS,
        label = "Planning",
        a11yDescription = "Navigate to Planning",
    ),
    Settings(
        route = Route.Settings.route,
        iconToken = IconToken.SETTINGS,
        label = "Settings",
        a11yDescription = "Navigate to Settings",
    ),
}

/**
 * Material 3 [NavigationBar] with the four primary Finance tabs.
 *
 * Each item carries a `contentDescription` for TalkBack and uses the
 * Material 3 selected-state indicator.
 *
 * @param navController The [NavHostController] used for navigation state and actions.
 * @param modifier Modifier applied to the [NavigationBar].
 */
@Composable
fun FinanceBottomBar(
    navController: NavHostController,
    modifier: Modifier = Modifier,
) {
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination

    NavigationBar(modifier = modifier) {
        TopLevelDestination.entries.forEach { destination ->
            val selected = currentDestination?.route == destination.route

            NavigationBarItem(
                selected = selected,
                onClick = {
                    navController.navigate(destination.route) {
                        // Pop up to the start destination to avoid building up
                        // a large back-stack of top-level destinations.
                        popUpTo(navController.graph.findStartDestination().id) {
                            saveState = true
                        }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                icon = {
                    IconView(token = destination.iconToken)
                },
                label = { Text(text = destination.label) },
                modifier = Modifier.semantics {
                    contentDescription = destination.a11yDescription
                },
            )
        }
    }
}
