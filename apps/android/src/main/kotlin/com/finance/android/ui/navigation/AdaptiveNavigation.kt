@file:Suppress("MatchingDeclarationName") // File contains multiple related declarations

// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.navigation

import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass

/**
 * Navigation layout style determined by the current window width.
 *
 * - **BottomBar:** Used for compact widths (phones in portrait).
 *   Material 3 [androidx.compose.material3.NavigationBar] at the bottom of the
 *   screen.
 *
 * - **NavigationRail:** Used for medium widths (large phones in landscape, small
 *   tablets, unfolded foldables). Material 3
 *   [androidx.compose.material3.NavigationRail] keeps primary destinations
 *   visible on the leading edge instead of hiding them behind a hamburger.
 *
 * - **ModalDrawer:** Used for expanded widths (large tablets, desktop). Material 3
 *   [androidx.compose.material3.ModalNavigationDrawer] surfaces richer
 *   navigation with labels.
 *
 * This follows the Material 3 adaptive layout guidelines
 * (Compact → bottom bar, Medium → rail, Expanded → drawer):
 * @see <a href="https://m3.material.io/foundations/layout/applying-layout/compact">
 *   Material 3 Adaptive Layout</a>
 */
enum class NavigationLayoutType {
    /** Phone portrait — bottom navigation bar. */
    BottomBar,

    /** Large phone landscape / small tablet / foldable — navigation rail. */
    NavigationRail,

    /** Large tablet / desktop — modal navigation drawer. */
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
    WindowWidthSizeClass.Medium -> NavigationLayoutType.NavigationRail
    else -> NavigationLayoutType.ModalDrawer
}
