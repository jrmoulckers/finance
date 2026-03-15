// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.navigation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import com.finance.android.ui.screens.AccountsScreen
import com.finance.android.ui.screens.BudgetsScreen
import com.finance.android.ui.screens.DashboardScreen
import com.finance.android.ui.screens.GoalsScreen
import com.finance.android.ui.screens.SettingsScreen
import com.finance.android.ui.screens.TransactionCreateScreen
import com.finance.android.ui.screens.TransactionsScreen
import timber.log.Timber

/** Base URI for all deep link patterns declared in AndroidManifest.xml. */
private const val DEEP_LINK_BASE = "https://finance.app"

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

    /**
     * OAuth callback deep link destination.
     *
     * Matches `https://finance.app/auth/callback?code=…&state=…`.
     * TODO(#434): Wire to actual OAuth flow once auth module is implemented.
     */
    data object AuthCallback : Route("auth/callback")

    /**
     * Household invitation deep link destination.
     *
     * Matches `https://finance.app/invite/{code}`.
     * TODO: Wire to household invite acceptance flow once household feature is implemented.
     */
    data object Invite : Route("invite/{code}") {
        fun createRoute(code: String): String = "invite/$code"
    }

    /**
     * Transaction detail deep link destination.
     *
     * Matches `https://finance.app/transaction/{id}`.
     */
    data object TransactionDetail : Route("transaction/{id}") {
        fun createRoute(id: String): String = "transaction/$id"
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
            SettingsScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToLogin = {
                    navController.navigate(Route.Dashboard.route) {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
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

        // ── Deep link destinations ──────────────────────────────────

        // TODO(#434): Replace placeholder with actual OAuth handling once auth module
        // is implemented. Currently logs the callback and navigates to Dashboard.
        // The auth callback URL (https://finance.app/auth/callback?code=…&state=…)
        // will be handled by AuthViewModel once the auth module is ready.
        composable(
            route = Route.AuthCallback.route,
            deepLinks = listOf(
                navDeepLink { uriPattern = "$DEEP_LINK_BASE/auth/callback" },
            ),
        ) {
            Timber.d("Deep link: auth/callback received, redirecting to Dashboard")

            LaunchedEffect(Unit) {
                navController.navigate(Route.Dashboard.route) {
                    popUpTo(Route.Dashboard.route) { inclusive = true }
                    launchSingleTop = true
                }
            }

            // Brief loading indicator while redirecting
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .semantics { contentDescription = "Processing sign in" },
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(
                        modifier = Modifier.semantics {
                            contentDescription = "Sign in progress indicator"
                        },
                    )
                    Spacer(Modifier.height(16.dp))
                    Text(
                        text = "Completing sign in…",
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
            }
        }

        // TODO: Wire to household invite acceptance flow once household feature
        // is implemented. Currently shows a placeholder screen with the invite code.
        composable(
            route = Route.Invite.route,
            arguments = listOf(
                navArgument("code") { type = NavType.StringType },
            ),
            deepLinks = listOf(
                navDeepLink { uriPattern = "$DEEP_LINK_BASE/invite/{code}" },
            ),
        ) { backStackEntry ->
            val inviteCode = backStackEntry.arguments?.getString("code").orEmpty()
            Timber.d("Deep link: household invite received (code length: %d)", inviteCode.length)

            // TODO: Pass inviteCode to HouseholdViewModel to validate and accept invitation
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .semantics { contentDescription = "Household invitation" },
                contentAlignment = Alignment.Center,
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                    modifier = Modifier.padding(24.dp),
                ) {
                    Text(
                        text = "Household Invitation",
                        style = MaterialTheme.typography.headlineSmall,
                        modifier = Modifier.semantics {
                            contentDescription = "Household Invitation heading"
                        },
                    )
                    Spacer(Modifier.height(16.dp))
                    Text(
                        text = "Invitation support coming soon.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.semantics {
                            contentDescription = "Invitation support coming soon"
                        },
                    )
                }
            }
        }

        composable(
            route = Route.TransactionDetail.route,
            arguments = listOf(
                navArgument("id") { type = NavType.StringType },
            ),
            deepLinks = listOf(
                navDeepLink { uriPattern = "$DEEP_LINK_BASE/transaction/{id}" },
            ),
        ) { backStackEntry ->
            val transactionId = backStackEntry.arguments?.getString("id").orEmpty()
            Timber.d("Deep link: transaction detail for id=%s", transactionId)

            // TODO: Build full TransactionDetailScreen with transaction data loading
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .semantics { contentDescription = "Transaction details" },
                contentAlignment = Alignment.Center,
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                    modifier = Modifier.padding(24.dp),
                ) {
                    Text(
                        text = "Transaction Details",
                        style = MaterialTheme.typography.headlineSmall,
                        modifier = Modifier.semantics {
                            contentDescription = "Transaction Details heading"
                        },
                    )
                    Spacer(Modifier.height(16.dp))
                    Text(
                        text = "Transaction detail view coming soon.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.semantics {
                            contentDescription = "Transaction detail view coming soon"
                        },
                    )
                }
            }
        }
    }
}
