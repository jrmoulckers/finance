// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.e2e.robot

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.rules.ActivityScenarioRule
import com.finance.android.MainActivity

/**
 * Robot for bottom-navigation interactions.
 *
 * Encapsulates the mechanics of tapping bottom-nav items and
 * waiting for destination screens to appear.
 */
class NavigationRobot(
    private val rule: AndroidComposeTestRule<ActivityScenarioRule<MainActivity>, MainActivity>,
) {

    /** Tap the Dashboard bottom-nav item. */
    fun navigateToDashboard() {
        rule.onNodeWithContentDescription("Navigate to Dashboard")
            .performClick()
        rule.waitForIdle()
    }

    /** Tap the Accounts bottom-nav item. */
    fun navigateToAccounts() {
        rule.onNodeWithContentDescription("Navigate to Accounts")
            .performClick()
        rule.waitForIdle()
    }

    /** Tap the Activity (Transactions) bottom-nav item. */
    fun navigateToTransactions() {
        rule.onNodeWithContentDescription("View transaction activity")
            .performClick()
        rule.waitForIdle()
    }

    /** Tap the Budgets bottom-nav item. */
    fun navigateToBudgets() {
        rule.onNodeWithContentDescription("Navigate to Budgets")
            .performClick()
        rule.waitForIdle()
    }

    /** Tap the Goals bottom-nav item. */
    fun navigateToGoals() {
        rule.onNodeWithContentDescription("Navigate to Goals")
            .performClick()
        rule.waitForIdle()
    }

    /** Assert a bottom-nav item with [label] is displayed. */
    fun assertBottomNavItemVisible(label: String) {
        rule.onNodeWithText(label).assertIsDisplayed()
    }

    /** Assert all five bottom-nav items are present. */
    fun assertAllBottomNavItemsVisible() {
        assertBottomNavItemVisible("Dashboard")
        assertBottomNavItemVisible("Accounts")
        assertBottomNavItemVisible("Activity")
        assertBottomNavItemVisible("Budgets")
        assertBottomNavItemVisible("Goals")
    }
}
