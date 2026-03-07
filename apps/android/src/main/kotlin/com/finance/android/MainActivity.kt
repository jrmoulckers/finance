package com.finance.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.finance.android.ui.navigation.FinanceBottomBar
import com.finance.android.ui.navigation.FinanceNavHost
import com.finance.android.ui.navigation.FinanceTopBar
import com.finance.android.ui.navigation.Route
import com.finance.android.ui.theme.FinanceTheme

/**
 * Single-activity host for the Compose UI.
 *
 * All navigation is handled within Compose via navigation-compose.
 * The activity wires up [FinanceTopBar], [FinanceBottomBar], [FinanceNavHost],
 * and a [FloatingActionButton] for quick transaction creation.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            FinanceTheme {
                FinanceApp()
            }
        }
    }
}

/**
 * Root composable for the Finance app.
 *
 * Provides [Scaffold] with the top bar, bottom navigation, FAB, and [NavHost].
 */
@Composable
fun FinanceApp(modifier: Modifier = Modifier) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    // Show FAB only on Dashboard and Transactions screens
    val showFab = currentRoute in setOf(
        Route.Dashboard.route,
        Route.Transactions.route,
    )

    // Show bottom bar only on top-level destinations
    val showBottomBar = currentRoute in setOf(
        Route.Dashboard.route,
        Route.Accounts.route,
        Route.Transactions.route,
        Route.Budgets.route,
        Route.Goals.route,
    )

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = { FinanceTopBar(navController = navController) },
        bottomBar = {
            if (showBottomBar) {
                FinanceBottomBar(navController = navController)
            }
        },
        floatingActionButton = {
            if (showFab) {
                FloatingActionButton(
                    onClick = {
                        navController.navigate(Route.TransactionCreate.createRoute()) {
                            launchSingleTop = true
                        }
                    },
                    modifier = Modifier.semantics {
                        contentDescription = "Create new transaction"
                    },
                ) {
                    Icon(
                        imageVector = Icons.Filled.Add,
                        contentDescription = "Create new transaction",
                    )
                }
            }
        },
    ) { innerPadding ->
        FinanceNavHost(
            navController = navController,
            modifier = Modifier.padding(innerPadding),
        )
    }
}
