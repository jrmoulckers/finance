// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState

/**
 * Resolves a human-readable title for the given route string.
 */
private fun titleForRoute(route: String?): String = when (route) {
    Route.Dashboard.route -> "Dashboard"
    Route.Accounts.route -> "Accounts"
    Route.Transactions.route -> "Transactions"
    Route.Planning.route -> "Planning"
    Route.Budgets.route -> "Budgets"
    Route.Goals.route -> "Goals"
    Route.Analytics.route -> "Analytics"
    Route.Settings.route -> "Settings"
    Route.AccountDetail.route -> "Account Details"
    Route.TransactionCreate.route -> "New Transaction"
    Route.AuthCallback.route -> "Sign In"
    Route.Invite.route -> "Invitation"
    Route.TransactionDetail.route -> "Transaction Details"
    else -> "Finance"
}

/**
 * Returns `true` when the current route is a top-level tab (no back arrow needed).
 */
private fun isTopLevel(route: String?): Boolean = route in setOf(
    Route.Dashboard.route,
    Route.Transactions.route,
    Route.Planning.route,
    Route.Settings.route,
)

/**
 * Configurable [TopAppBar] that adapts its title and actions per route.
 *
 * - Title changes based on the current navigation destination.
 * - A back arrow is shown for non-top-level screens.
 * - A Search icon is available on Dashboard (navigates to Transactions).
 *
 * @param navController The [NavHostController] for reading current route and navigation.
 * @param modifier Modifier applied to the [TopAppBar].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FinanceTopBar(
    navController: NavHostController,
    modifier: Modifier = Modifier,
) {
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route
    val title = titleForRoute(currentRoute)
    val topLevel = isTopLevel(currentRoute)

    TopAppBar(
        title = {
            Text(
                text = title,
                modifier = Modifier.semantics {
                    contentDescription = "$title screen"
                },
            )
        },
        navigationIcon = {
            if (!topLevel) {
                IconButton(
                    onClick = { navController.popBackStack() },
                    modifier = Modifier.semantics {
                        contentDescription = "Navigate back"
                    },
                ) {
                    Icon(
                        imageVector = Icons.Filled.ArrowBack,
                        contentDescription = "Navigate back",
                    )
                }
            }
        },
        actions = {
            if (currentRoute == Route.Dashboard.route) {
                IconButton(
                    onClick = {
                        navController.navigate(Route.Transactions.route) {
                            launchSingleTop = true
                        }
                    },
                    modifier = Modifier.semantics {
                        contentDescription = "Search"
                    },
                ) {
                    Icon(
                        imageVector = Icons.Filled.Search,
                        contentDescription = "Search",
                    )
                }
            }
        },
        modifier = modifier,
    )
}
