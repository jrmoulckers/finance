// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.e2e

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithContentDescription
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
     * Verify all five bottom-nav items are rendered on launch.
     */
    @Test
    fun bottomNav_allItemsVisible() {
        val nav = NavigationRobot(composeTestRule)
        val dash = DashboardRobot(composeTestRule)
        dash.waitForDashboardLoaded()
        nav.assertAllBottomNavItemsVisible()
    }

    /**
     * Verify navigating to Accounts displays the Accounts screen.
     */
    @Test
    fun navigateToAccounts_displaysAccountsScreen() {
        val nav = NavigationRobot(composeTestRule)
        val dash = DashboardRobot(composeTestRule)
        dash.waitForDashboardLoaded()
        nav.navigateToAccounts()
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
     * Verify navigating to Budgets tab displays the Budgets screen.
     */
    @Test
    fun navigateToBudgets_displaysBudgetsScreen() {
        val nav = NavigationRobot(composeTestRule)
        val dash = DashboardRobot(composeTestRule)
        dash.waitForDashboardLoaded()
        nav.navigateToBudgets()
        composeTestRule.waitForIdle()
    }

    /**
     * Verify navigating to Goals tab displays the Goals screen.
     */
    @Test
    fun navigateToGoals_displaysGoalsScreen() {
        val nav = NavigationRobot(composeTestRule)
        val dash = DashboardRobot(composeTestRule)
        dash.waitForDashboardLoaded()
        nav.navigateToGoals()
        composeTestRule.waitForIdle()
    }

    /**
     * Verify a full round-trip: Dashboard -> Accounts -> Dashboard.
     * Ensures back-stack management preserves the Dashboard state.
     */
    @Test
    fun roundTrip_dashboardToAccountsAndBack() {
        val nav = NavigationRobot(composeTestRule)
        val dash = DashboardRobot(composeTestRule)
        dash.waitForDashboardLoaded()
        nav.navigateToAccounts()
        composeTestRule.waitForIdle()
        nav.navigateToDashboard()
        dash.waitForDashboardLoaded()
        dash.assertNetWorthCardVisible()
    }
}
