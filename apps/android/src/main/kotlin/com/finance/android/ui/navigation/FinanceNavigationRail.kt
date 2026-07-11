// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.navigation

import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import com.finance.android.ui.components.IconView

/**
 * Material 3 [NavigationRail] with the four primary Finance destinations.
 *
 * Shown at medium window widths (large phones in landscape, small tablets,
 * unfolded foldables) where Material 3 recommends a rail on the leading edge
 * instead of a bottom bar or a hidden modal drawer (#3713). It mirrors the
 * destinations of [FinanceBottomBar], so navigation stays consistent as the
 * window resizes.
 *
 * Each item carries a `contentDescription` for TalkBack and uses the Material 3
 * selected-state indicator.
 *
 * @param navController The [NavHostController] used for navigation state and actions.
 * @param modifier Modifier applied to the [NavigationRail].
 */
@Composable
fun FinanceNavigationRail(
    navController: NavHostController,
    modifier: Modifier = Modifier,
) {
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination

    NavigationRail(
        modifier = modifier.semantics { contentDescription = "Primary navigation rail" },
    ) {
        TopLevelDestination.entries.forEach { destination ->
            val selected = currentDestination?.hierarchy?.any { it.route == destination.route } == true

            NavigationRailItem(
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
