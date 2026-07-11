// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.navigation

import kotlin.test.Test
import kotlin.test.assertNotNull

/**
 * Unit tests for [NavTransitions] to verify transition objects are defined.
 *
 * These are smoke tests to catch null reference issues. Full visual
 * transition testing is done via Paparazzi snapshot tests.
 */
class NavTransitionsTest {

    @Test
    fun `enterTransition is defined`() {
        assertNotNull(NavTransitions.enterTransition)
    }

    @Test
    fun `exitTransition is defined`() {
        assertNotNull(NavTransitions.exitTransition)
    }

    @Test
    fun `popEnterTransition is defined`() {
        assertNotNull(NavTransitions.popEnterTransition)
    }

    @Test
    fun `popExitTransition is defined`() {
        assertNotNull(NavTransitions.popExitTransition)
    }

    @Test
    fun `tabEnterTransition is defined`() {
        assertNotNull(NavTransitions.tabEnterTransition)
    }

    @Test
    fun `tabExitTransition is defined`() {
        assertNotNull(NavTransitions.tabExitTransition)
    }

    @Test
    fun `reducedEnterTransition is defined`() {
        assertNotNull(NavTransitions.reducedEnterTransition)
    }

    @Test
    fun `reducedExitTransition is defined`() {
        assertNotNull(NavTransitions.reducedExitTransition)
    }
}
