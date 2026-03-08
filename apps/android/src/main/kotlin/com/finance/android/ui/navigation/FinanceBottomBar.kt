// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState

/**
 * Describes a top-level destination shown in the bottom navigation bar.
 */
enum class TopLevelDestination(
    val route: String,
    val icon: ImageVector,
    val label: String,
    val a11yDescription: String,
) {
    Dashboard(
        route = Route.Dashboard.route,
        icon = Icons.Filled.Home,
        label = "Dashboard",
        a11yDescription = "Navigate to Dashboard",
    ),
    Accounts(
        route = Route.Accounts.route,
        icon = Icons.Filled.AccountBalance,
        label = "Accounts",
        a11yDescription = "Navigate to Accounts",
    ),
    Transactions(
        route = Route.Transactions.route,
        icon = Icons.Filled.SwapHoriz,
        label = "Transactions",
        a11yDescription = "Navigate to Transactions",
    ),
    Budgets(
        route = Route.Budgets.route,
        icon = Icons.Filled.PieChart,
        label = "Budgets",
        a11yDescription = "Navigate to Budgets",
    ),
    Goals(
        route = Route.Goals.route,
        icon = Icons.Filled.Flag,
        label = "Goals",
        a11yDescription = "Navigate to Goals",
    ),
}

/**
 * Material 3 [NavigationBar] with the five primary Finance tabs.
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
            val selected = currentDestination?.hierarchy?.any {
                it.route == destination.route
            } == true

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
                    Icon(
                        imageVector = destination.icon,
                        contentDescription = destination.a11yDescription,
                    )
                },
                label = { Text(text = destination.label) },
                modifier = Modifier.semantics {
                    contentDescription = destination.a11yDescription
                },
            )
        }
    }
}
