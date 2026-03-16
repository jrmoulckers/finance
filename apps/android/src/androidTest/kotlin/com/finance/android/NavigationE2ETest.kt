// SPDX-License-Identifier: BUSL-1.1

package com.finance.android

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Sample end-to-end coverage for shell navigation across the bottom tabs.
 */
@RunWith(AndroidJUnit4::class)
class NavigationE2ETest : BaseE2ETest() {

    /** Verifies that every bottom tab is visible and navigates to its destination screen. */
    @Test
    fun bottomNavigation_showsAllTabsAndNavigatesToEachDestination() {
        composeTestRule.onNodeWithText(DashboardTab).assertIsDisplayed()
        composeTestRule.onNodeWithText(AccountsTab).assertIsDisplayed()
        composeTestRule.onNodeWithText(TransactionsTab).assertIsDisplayed()
        composeTestRule.onNodeWithText(BudgetsTab).assertIsDisplayed()
        composeTestRule.onNodeWithText(GoalsTab).assertIsDisplayed()

        navigateToTab(DashboardTab)
        waitForLoadingToFinish("Loading dashboard")
        composeTestRule.onNodeWithText("Net Worth").assertIsDisplayed()
        assertTalkBackLabel("Recent Transactions section")

        navigateToTab(AccountsTab)
        waitForLoadingToFinish("Loading accounts")
        assertTalkBackLabelContains("No accounts yet")

        navigateToTab(TransactionsTab)
        waitForLoadingToFinish("Loading transactions")
        composeTestRule.onNodeWithContentDescription("Search transactions").assertIsDisplayed()

        navigateToTab(BudgetsTab)
        waitForLoadingToFinish("Loading budgets")
        composeTestRule.onNodeWithText("Your Budgets").assertIsDisplayed()

        navigateToTab(GoalsTab)
        waitForLoadingToFinish("Loading goals")
        assertTalkBackLabelContains("Goals:")
    }

    private companion object {
        private const val DashboardTab = "Dashboard"
        private const val AccountsTab = "Accounts"
        private const val TransactionsTab = "Transactions"
        private const val BudgetsTab = "Budgets"
        private const val GoalsTab = "Goals"
    }
}
