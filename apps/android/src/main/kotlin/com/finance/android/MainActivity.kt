// SPDX-License-Identifier: BUSL-1.1

package com.finance.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.core.util.Consumer
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.finance.android.auth.AuthState
import com.finance.android.auth.AuthViewModel
import com.finance.android.auth.LoginScreen
import com.finance.android.ui.navigation.FinanceBottomBar
import com.finance.android.ui.navigation.FinanceNavHost
import com.finance.android.ui.navigation.FinanceTopBar
import com.finance.android.ui.navigation.Route
import com.finance.android.ui.theme.FinanceTheme
import com.finance.android.ui.theme.ThemePreference
import com.finance.android.ui.theme.ThemePreferenceManager
import org.koin.android.ext.android.inject
import org.koin.compose.viewmodel.koinViewModel

/**
 * Single-activity host for the Compose UI.
 *
 * All navigation is handled within Compose via navigation-compose.
 * The activity wires up [FinanceTopBar], [FinanceBottomBar], [FinanceNavHost],
 * and a [FloatingActionButton] for quick transaction creation.
 */
class MainActivity : ComponentActivity() {

    private val themePreferenceManager: ThemePreferenceManager by inject()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val themePreference by themePreferenceManager.themePreference.collectAsState()
            val darkTheme = when (themePreference) {
                ThemePreference.LIGHT -> false
                ThemePreference.DARK -> true
                ThemePreference.SYSTEM -> isSystemInDarkTheme()
            }

            val highContrast by themePreferenceManager.highContrastEnabled.collectAsState()

            FinanceTheme(darkTheme = darkTheme, highContrast = highContrast) {
                FinanceApp()
            }
        }
    }
}

/**
 * Root composable for the Finance app.
 *
 * Observes [AuthViewModel.authState] to gate content:
 * - [AuthState.Loading] → splash / loading indicator
 * - [AuthState.Unauthenticated] or [AuthState.Error] → [LoginScreen]
 * - [AuthState.Authenticated] → main [Scaffold] with nav host
 *
 * This ensures the login screen is shown without the app chrome
 * (top bar, bottom bar, FAB) while the authenticated experience
 * retains the full navigation shell.
 */
@Composable
fun FinanceApp(modifier: Modifier = Modifier) {
    val authViewModel: AuthViewModel = koinViewModel()
    val authState by authViewModel.authState.collectAsState()

    when (authState) {
        is AuthState.Loading -> {
            AuthLoadingScreen(modifier = modifier)
        }
        is AuthState.Unauthenticated, is AuthState.Error -> {
            LoginScreen(viewModel = authViewModel)
        }
        is AuthState.Authenticated -> {
            AuthenticatedContent(modifier = modifier)
        }
    }
}

/**
 * Loading screen displayed while restoring a persisted auth session.
 */
@Composable
private fun AuthLoadingScreen(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator(
            modifier = Modifier.semantics {
                contentDescription = "Loading, please wait"
                liveRegion = androidx.compose.ui.semantics.LiveRegionMode.Polite
            },
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Loading…",
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.semantics {
                contentDescription = "Application is loading"
            },
        )
    }
}

/**
 * Main app content shown after successful authentication.
 *
 * Provides [Scaffold] with the top bar, bottom navigation, FAB,
 * and [FinanceNavHost]. Deep link intents are forwarded to the
 * nav controller for routing.
 */
@Composable
private fun AuthenticatedContent(modifier: Modifier = Modifier) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    // Forward deep link intents that arrive while the activity is already running.
    // On first launch, NavHost automatically processes the Activity's initial intent.
    val context = LocalContext.current
    DisposableEffect(Unit) {
        val activity = context as ComponentActivity
        val listener = Consumer<Intent> { intent ->
            navController.handleDeepLink(intent)
        }
        activity.addOnNewIntentListener(listener)
        onDispose {
            activity.removeOnNewIntentListener(listener)
        }
    }

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
