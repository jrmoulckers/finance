// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.navigation

import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Unit tests for adaptive navigation layout resolution (#3713).
 *
 * Verifies the Material 3 adaptive mapping: compact widths use a bottom bar,
 * medium widths use a navigation rail (not a hidden modal drawer), and expanded
 * widths use a drawer.
 */
class AdaptiveNavigationTest {

    @Test
    fun `compact width resolves to bottom bar`() {
        assertEquals(
            NavigationLayoutType.BottomBar,
            resolveNavigationLayout(WindowWidthSizeClass.Compact),
        )
    }

    @Test
    fun `medium width resolves to navigation rail`() {
        assertEquals(
            NavigationLayoutType.NavigationRail,
            resolveNavigationLayout(WindowWidthSizeClass.Medium),
        )
    }

    @Test
    fun `expanded width resolves to modal drawer`() {
        assertEquals(
            NavigationLayoutType.ModalDrawer,
            resolveNavigationLayout(WindowWidthSizeClass.Expanded),
        )
    }

    @Test
    fun `medium width is not a modal drawer`() {
        // Regression guard for #3713: medium must never hide primary
        // navigation behind a modal drawer.
        val layout = resolveNavigationLayout(WindowWidthSizeClass.Medium)
        assertEquals(NavigationLayoutType.NavigationRail, layout)
    }
}
