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

    /** Tap the Activity (Transactions) bottom-nav item. */
    fun navigateToTransactions() {
        rule.onNodeWithContentDescription("View transaction activity")
            .performClick()
        rule.waitForIdle()
    }

    /** Tap the Planning bottom-nav item. */
    fun navigateToPlanning() {
        rule.onNodeWithContentDescription("Navigate to Planning")
            .performClick()
        rule.waitForIdle()
    }

    /** Tap the Settings bottom-nav item. */
    fun navigateToSettings() {
        rule.onNodeWithContentDescription("Navigate to Settings")
            .performClick()
        rule.waitForIdle()
    }

    /** Assert a bottom-nav item with [label] is displayed. */
    fun assertBottomNavItemVisible(label: String) {
        rule.onNodeWithText(label).assertIsDisplayed()
    }

    /** Assert all four bottom-nav items are present. */
    fun assertAllBottomNavItemsVisible() {
        assertBottomNavItemVisible("Dashboard")
        assertBottomNavItemVisible("Activity")
        assertBottomNavItemVisible("Planning")
        assertBottomNavItemVisible("Settings")
    }
}
