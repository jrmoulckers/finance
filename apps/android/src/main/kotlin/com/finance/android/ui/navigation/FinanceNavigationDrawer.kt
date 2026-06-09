// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.navigation

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.DrawerState
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.finance.android.ui.components.IconView
import com.finance.core.icons.IconToken
import timber.log.Timber

/**
 * Describes a drawer destination, mirroring [TopLevelDestination] for the
 * navigation drawer pattern used on wider screens (tablets, landscape).
 */
private data class DrawerDestination(
    val route: String,
    val label: String,
    val iconToken: IconToken,
    val a11yDescription: String,
)

/**
 * All drawer destinations — same tabs as the bottom bar.
 */
private val drawerDestinations = listOf(
    DrawerDestination(
        route = Route.Dashboard.route,
        label = "Dashboard",
        iconToken = IconToken.DASHBOARD,
        a11yDescription = "Navigate to Dashboard",
    ),
    DrawerDestination(
        route = Route.Transactions.route,
        label = "Activity",
        iconToken = IconToken.TRANSACTIONS,
        a11yDescription = "View transaction activity",
    ),
    DrawerDestination(
        route = Route.Planning.route,
        label = "Planning",
        iconToken = IconToken.BUDGETS,
        a11yDescription = "Navigate to Planning",
    ),
    DrawerDestination(
        route = Route.Settings.route,
        label = "Settings",
        iconToken = IconToken.SETTINGS,
        a11yDescription = "Navigate to Settings",
    ),
)

/**
 * Material 3 modal navigation drawer for the Finance app.
 *
 * Used on wider screen configurations (tablets, foldables, landscape) where a
 * bottom navigation bar would waste space. The drawer mirrors the same
 * top-level destinations as [FinanceBottomBar].
 *
 * ## Usage
 * ```kotlin
 * val drawerState = rememberDrawerState(DrawerValue.Closed)
 * FinanceNavigationDrawer(
 *     drawerState = drawerState,
 *     currentRoute = currentRoute,
 *     onDestinationSelected = { route -> navController.navigate(route) },
 * ) {
 *     // Screen content
 * }
 * ```
 *
 * @param drawerState The [DrawerState] controlling open/close.
 * @param currentRoute The currently active route for selection highlighting.
 * @param onDestinationSelected Callback when a drawer item is tapped.
 * @param modifier Modifier applied to the drawer.
 * @param content The main content displayed alongside the drawer.
 */
@Composable
fun FinanceNavigationDrawer(
    drawerState: DrawerState,
    currentRoute: String?,
    onDestinationSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    ModalNavigationDrawer(
        drawerState = drawerState,
        modifier = modifier,
        drawerContent = {
            ModalDrawerSheet(
                modifier = Modifier
                    .width(280.dp)
                    .semantics {
                        contentDescription = "Navigation menu"
                    },
            ) {
                // App branding header
                Text(
                    text = "Finance",
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .padding(horizontal = 28.dp, vertical = 24.dp)
                        .semantics {
                            contentDescription = "Finance application menu"
                        },
                )

                HorizontalDivider(
                    modifier = Modifier.padding(horizontal = 28.dp),
                    color = MaterialTheme.colorScheme.outlineVariant,
                )

                Spacer(Modifier.height(12.dp))

                drawerDestinations.forEach { destination ->
                    val selected = currentRoute == destination.route
                    NavigationDrawerItem(
                        icon = {
                            IconView(token = destination.iconToken)
                        },
                        label = {
                            Text(text = destination.label)
                        },
                        selected = selected,
                        onClick = {
                            Timber.d("Drawer navigation: %s", destination.route)
                            onDestinationSelected(destination.route)
                        },
                        modifier = Modifier
                            .padding(NavigationDrawerItemDefaults.ItemPadding)
                            .semantics {
                                contentDescription = destination.a11yDescription
                            },
                    )
                }
            }
        },
        content = content,
    )
}
