// SPDX-License-Identifier: BUSL-1.1

package com.finance.android

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Sample end-to-end coverage for the dashboard surface.
 */
@RunWith(AndroidJUnit4::class)
class DashboardE2ETest : BaseE2ETest() {

    /** Verifies that key dashboard summary content is visible to sighted and TalkBack users. */
    @Test
    fun dashboard_displaysNetWorthRecentTransactionsAndBudgetSummaries() {
        navigateToTab("Dashboard")
        waitForLoadingToFinish("Loading dashboard")

        composeTestRule.onNodeWithText("Net Worth").assertIsDisplayed()
        assertTalkBackLabelContains("Net worth:")

        composeTestRule.onNodeWithText("Budget Health").assertIsDisplayed()
        assertTalkBackLabel("Budget Health section")

        composeTestRule.onNodeWithText("Recent Transactions").assertIsDisplayed()
        assertTalkBackLabel("Recent Transactions section")

        composeTestRule.onNodeWithText("View All").assertIsDisplayed()
    }
}
