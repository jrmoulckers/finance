package com.finance.android.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.finance.android.ui.screens.AccountsScreen
import com.finance.android.ui.screens.BudgetsScreen
import com.finance.android.ui.screens.DashboardScreen
import com.finance.android.ui.screens.GoalsScreen
import com.finance.android.ui.screens.SettingsScreen
import com.finance.android.ui.screens.TransactionCreateScreen
import com.finance.android.ui.screens.TransactionsScreen

/**
 * Typed route hierarchy for the Finance app.
 *
 * Top-level tabs and sub-routes are modelled as a sealed class so that
 * the compiler verifies exhaustiveness.
 */
sealed class Route(val route: String) {
    data object Dashboard : Route("dashboard")
    data object Accounts : Route("accounts")
    data object Transactions : Route("transactions")
    data object Budgets : Route("budgets")
    data object Goals : Route("goals")
    data object Settings : Route("settings")
    data object AccountDetail : Route("accounts/{id}") {
        fun createRoute(id: String): String = "accounts/$id"
    }
    data object TransactionCreate : Route("transactions/create?accountId={accountId}") {
        fun createRoute(accountId: String? = null): String =
            if (accountId != null) "transactions/create?accountId=$accountId"
            else "transactions/create"
    }
}

/**
 * Main navigation host for the Finance app.
 *
 * Wired into [MainActivity]'s [Scaffold] and driven by the bottom navigation bar.
 *
 * @param navController The shared [NavHostController] that manages back-stack and navigation.
 * @param modifier Modifier applied to the [NavHost] container.
 * @param onNavigateToSettings Callback invoked when the user taps the Settings action.
 */
@Composable
fun FinanceNavHost(
    navController: NavHostController,
    modifier: Modifier = Modifier,
) {
    NavHost(
        navController = navController,
        startDestination = Route.Dashboard.route,
        modifier = modifier,
    ) {
        // ── Top-level tabs ──────────────────────────────────────────
        composable(Route.Dashboard.route) {
            DashboardScreen(
                onAddTransaction = {
                    navController.navigate(Route.TransactionCreate.createRoute()) {
                        launchSingleTop = true
                    }
                },
                onViewAllTransactions = {
                    navController.navigate(Route.Transactions.route) {
                        launchSingleTop = true
                    }
                },
            )
        }

        composable(Route.Accounts.route) {
            AccountsScreen(
                onAccountClick = { id ->
                    navController.navigate(Route.AccountDetail.createRoute(id))
                },
            )
        }

        composable(Route.Transactions.route) {
            TransactionsScreen()
        }

        composable(Route.Budgets.route) {
            BudgetsScreen()
        }

        composable(Route.Goals.route) {
            GoalsScreen()
        }

        // ── Secondary screens ───────────────────────────────────────
        composable(Route.Settings.route) {
            SettingsScreen(onNavigateBack = { navController.popBackStack() })
        }

        composable(
            route = Route.AccountDetail.route,
            arguments = listOf(navArgument("id") { type = NavType.StringType }),
        ) { backStackEntry ->
            val accountId = backStackEntry.arguments?.getString("id").orEmpty()
            // Account detail is handled within AccountsScreen via ViewModel state
            AccountsScreen(
                onAccountClick = {},
            )
        }

        composable(
            route = Route.TransactionCreate.route,
            arguments = listOf(
                navArgument("accountId") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
            ),
        ) {
            TransactionCreateScreen(
                onSaved = { navController.popBackStack() },
                onBack = { navController.popBackStack() },
            )
        }
    }
}
