@file:Suppress("MatchingDeclarationName") // File contains multiple related declarations

// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.navigation

import androidx.compose.material3.DrawerValue
import androidx.compose.material3.rememberDrawerState
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * Navigation layout style determined by the current window width.
 *
 * - **BottomBar:** Used for compact widths (phones in portrait).
 *   Material 3 [NavigationBar] at the bottom of the screen.
 *
 * - **ModalDrawer:** Used for medium and expanded widths (tablets, landscape,
 *   foldables). Material 3 [ModalNavigationDrawer] for richer navigation.
 *
 * This follows the Material 3 adaptive layout guidelines:
 * @see <a href="https://m3.material.io/foundations/layout/applying-layout/compact">
 *   Material 3 Adaptive Layout</a>
 */
enum class NavigationLayoutType {
    /** Phone portrait — bottom navigation bar. */
    BottomBar,

    /** Tablet / landscape — modal navigation drawer. */
    ModalDrawer,
}

/**
 * Resolves the appropriate [NavigationLayoutType] based on window width.
 *
 * @param windowWidthSizeClass The current [WindowWidthSizeClass].
 * @return The recommended navigation pattern for the given width.
 */
fun resolveNavigationLayout(
    windowWidthSizeClass: WindowWidthSizeClass,
): NavigationLayoutType = when (windowWidthSizeClass) {
    WindowWidthSizeClass.Compact -> NavigationLayoutType.BottomBar
    else -> NavigationLayoutType.ModalDrawer
}
