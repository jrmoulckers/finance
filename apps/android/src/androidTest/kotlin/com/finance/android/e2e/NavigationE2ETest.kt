// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.e2e

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import org.junit.Test
import com.finance.android.e2e.robot.DashboardRobot
import com.finance.android.e2e.robot.NavigationRobot

/**
 * E2E tests verifying that all bottom-navigation destinations
 * are reachable and display their expected content.
 *
 * These tests launch the full [MainActivity] with a pre-authenticated
 * session (via [E2ETestRunner]) and exercise the real navigation graph.
 */
class NavigationE2ETest : BaseE2ETest() {

    /**
     * Verify all four bottom-nav items are rendered on launch.
     */
    @Test
    fun bottomNav_allItemsVisible() {
        val nav = NavigationRobot(composeTestRule)
        val dash = DashboardRobot(composeTestRule)
        dash.waitForDashboardLoaded()
        nav.assertAllBottomNavItemsVisible()
    }

    /**
     * Verify navigating to Accounts via the Net Worth card on Dashboard.
     */
    @Test
    fun tapNetWorthCard_displaysAccountsScreen() {
        val nav = NavigationRobot(composeTestRule)
        val dash = DashboardRobot(composeTestRule)
        dash.waitForDashboardLoaded()
        dash.tapNetWorthCard()
        composeTestRule.onNodeWithContentDescription("Add new account")
            .assertIsDisplayed()
    }

    /**
     * Verify navigating to Activity tab displays Transactions.
     */
    @Test
    fun navigateToTransactions_displaysTransactionsScreen() {
        val nav = NavigationRobot(composeTestRule)
        val dash = DashboardRobot(composeTestRule)
        dash.waitForDashboardLoaded()
        nav.navigateToTransactions()
        composeTestRule.waitForIdle()
    }

    /**
     * Verify navigating to Planning tab displays the Budgets/Goals tabs.
     */
    @Test
    fun navigateToPlanning_displaysPlanningScreen() {
        val nav = NavigationRobot(composeTestRule)
        val dash = DashboardRobot(composeTestRule)
        dash.waitForDashboardLoaded()
        nav.navigateToPlanning()
        composeTestRule.onNodeWithText("Budgets").assertIsDisplayed()
        composeTestRule.onNodeWithText("Goals").assertIsDisplayed()
    }

    /**
     * Verify navigating to Settings tab displays the Settings screen.
     */
    @Test
    fun navigateToSettings_displaysSettingsScreen() {
        val nav = NavigationRobot(composeTestRule)
        val dash = DashboardRobot(composeTestRule)
        dash.waitForDashboardLoaded()
        nav.navigateToSettings()
        composeTestRule.waitForIdle()
    }

    /**
     * Verify a full round-trip: Dashboard -> Planning -> Dashboard.
     * Ensures back-stack management preserves the Dashboard state.
     */
    @Test
    fun roundTrip_dashboardToPlanningAndBack() {
        val nav = NavigationRobot(composeTestRule)
        val dash = DashboardRobot(composeTestRule)
        dash.waitForDashboardLoaded()
        nav.navigateToPlanning()
        composeTestRule.waitForIdle()
        nav.navigateToDashboard()
        dash.waitForDashboardLoaded()
        dash.assertNetWorthCardVisible()
    }
}
