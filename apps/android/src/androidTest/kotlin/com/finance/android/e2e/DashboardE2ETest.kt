// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.e2e

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import org.junit.Test
import com.finance.android.e2e.robot.DashboardRobot

/**
 * E2E tests verifying the Dashboard screen loads and displays
 * the expected summary data sections.
 *
 * The app is launched with a pre-authenticated session and
 * in-memory sample data, so the dashboard should render all
 * key sections (net worth, spending, budgets, transactions).
 */
class DashboardE2ETest : BaseE2ETest() {

    /**
     * Verify that the dashboard loads and shows the Net Worth card.
     */
    @Test
    fun dashboard_showsNetWorthCard() {
        val dash = DashboardRobot(composeTestRule)
        dash.waitForDashboardLoaded()
        dash.assertNetWorthCardVisible()
    }

    /**
     * Verify that the spending summary row with Today and This Month
     * cards is displayed on the dashboard.
     */
    @Test
    fun dashboard_showsSpendingSummary() {
        val dash = DashboardRobot(composeTestRule)
        dash.waitForDashboardLoaded()
        dash.assertSpendingSummaryVisible()
    }

    /**
     * Verify that the Recent Transactions section heading is visible.
     */
    @Test
    fun dashboard_showsRecentTransactions() {
        val dash = DashboardRobot(composeTestRule)
        dash.waitForDashboardLoaded()
        dash.assertRecentTransactionsHeaderVisible()
    }

    /**
     * Verify that the spending insights card is displayed.
     */
    @Test
    fun dashboard_showsInsightsCard() {
        val dash = DashboardRobot(composeTestRule)
        dash.waitForDashboardLoaded()
        dash.assertInsightsCardVisible()
    }

    /**
     * Verify that quick-action buttons (Add Transaction, View All)
     * are present on the dashboard.
     */
    @Test
    fun dashboard_showsQuickActions() {
        val dash = DashboardRobot(composeTestRule)
        dash.waitForDashboardLoaded()
        dash.assertQuickActionsVisible()
    }

    /**
     * Verify that all major dashboard sections are accessible via
     * their content descriptions (TalkBack parity check).
     */
    @Test
    fun dashboard_allSections_haveAccessibilityLabels() {
        val dash = DashboardRobot(composeTestRule)
        dash.waitForDashboardLoaded()

        // Net Worth card
        composeTestRule.onNodeWithContentDescription("Net Worth label")
            .assertIsDisplayed()

        // Spending summary cards
        composeTestRule.onNode(
            hasContentDescription("Today", substring = true),
        ).assertIsDisplayed()

        // Recent Transactions header
        composeTestRule.onNodeWithContentDescription("Recent Transactions section")
            .assertIsDisplayed()
    }
}
