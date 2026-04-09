// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.e2e.robot

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.compose.ui.test.onAllNodes
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.rules.ActivityScenarioRule
import com.finance.android.MainActivity

/**
 * Robot for Dashboard screen interactions.
 *
 * Provides high-level assertions for the net-worth card,
 * spending summaries, budget-health section, recent transactions,
 * and quick-action buttons.
 */
class DashboardRobot(
    private val rule: AndroidComposeTestRule<ActivityScenarioRule<MainActivity>, MainActivity>,
) {

    /** Wait for the dashboard loading state to finish. */
    fun waitForDashboardLoaded() {
        rule.waitUntil(timeoutMillis = 5_000) {
            rule.onAllNodes(hasContentDescription("Loading dashboard"))
                .fetchSemanticsNodes()
                .isEmpty()
        }
    }

    /** Assert the Net Worth card is displayed. */
    fun assertNetWorthCardVisible() {
        rule.onNode(hasContentDescription("Net Worth label"))
            .assertIsDisplayed()
    }

    /** Assert the spending summary row is displayed. */
    fun assertSpendingSummaryVisible() {
        rule.onNode(hasText("Today")).assertIsDisplayed()
        rule.onNode(hasText("This Month")).assertIsDisplayed()
    }

    /** Assert the Recent Transactions heading is visible. */
    fun assertRecentTransactionsHeaderVisible() {
        rule.onNodeWithContentDescription("Recent Transactions section")
            .assertIsDisplayed()
    }

    /** Assert the spending insights card is visible. */
    fun assertInsightsCardVisible() {
        rule.onNodeWithContentDescription("View spending insights and analytics")
            .assertIsDisplayed()
    }

    /** Assert the quick-action buttons are present. */
    fun assertQuickActionsVisible() {
        rule.onNodeWithContentDescription("Add new transaction")
            .assertIsDisplayed()
        rule.onNodeWithContentDescription("View all transactions")
            .assertIsDisplayed()
    }

    /** Tap the Add Transaction quick action button. */
    fun tapAddTransaction() {
        rule.onNodeWithContentDescription("Add new transaction")
            .performClick()
        rule.waitForIdle()
    }

    /** Tap the View All quick action button. */
    fun tapViewAllTransactions() {
        rule.onNodeWithContentDescription("View all transactions")
            .performClick()
        rule.waitForIdle()
    }

    /** Tap the Net Worth card to navigate to Accounts. */
    fun tapNetWorthCard() {
        rule.onNode(hasContentDescription("Net worth", substring = true))
            .performClick()
        rule.waitForIdle()
    }
}
