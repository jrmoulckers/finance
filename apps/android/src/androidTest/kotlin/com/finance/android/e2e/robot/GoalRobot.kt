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
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.rules.ActivityScenarioRule
import com.finance.android.MainActivity

/**
 * Robot for Goal screen interactions.
 *
 * Covers the Goals list, goal creation form, and goal progress
 * display. Navigates through the Planning tab's Goals sub-tab.
 */
class GoalRobot(
    private val rule: AndroidComposeTestRule<ActivityScenarioRule<MainActivity>, MainActivity>,
) {

    /** Wait for goals content to finish loading. */
    fun waitForGoalsLoaded() {
        rule.waitUntil(timeoutMillis = 5_000) {
            rule.onAllNodes(hasContentDescription("Loading goals"))
                .fetchSemanticsNodes()
                .isEmpty()
        }
    }

    /** Tap the Goals tab in the Planning screen. */
    fun tapGoalsTab() {
        rule.onNodeWithContentDescription("Goals tab")
            .performClick()
        rule.waitForIdle()
    }

    /** Assert the Goals tab content is visible. */
    fun assertGoalsTabVisible() {
        rule.onNodeWithText("Goals").assertIsDisplayed()
    }

    /** Tap the FAB to create a new goal. */
    fun tapCreateGoalFab() {
        rule.onNodeWithContentDescription("Create new goal")
            .performClick()
        rule.waitForIdle()
    }

    /** Assert the goal creation form is displayed. */
    fun assertCreateFormVisible() {
        rule.onNode(hasContentDescription("New Goal screen"))
            .assertIsDisplayed()
    }

    /** Enter the goal [name] into the name field. */
    fun enterGoalName(name: String) {
        rule.onNodeWithContentDescription("Goal name input")
            .performTextInput(name)
    }

    /** Enter the [amount] into the target amount field. */
    fun enterTargetAmount(amount: String) {
        rule.onNodeWithContentDescription("Target amount in dollars")
            .performTextInput(amount)
    }

    /** Tap the Save Goal button. */
    fun tapSave() {
        rule.onNodeWithContentDescription("Save goal")
            .performClick()
        rule.waitForIdle()
    }

    /** Assert a goal with [name] appears in the goals list. */
    fun assertGoalInList(name: String) {
        rule.onNode(hasText(name)).assertIsDisplayed()
    }

    /** Assert the goals summary header is visible with counts. */
    fun assertGoalsSummaryVisible() {
        rule.onNode(hasContentDescription("Goals:", substring = true))
            .assertIsDisplayed()
    }

    /** Assert the save button has proper accessibility label. */
    fun assertSaveButtonAccessible() {
        rule.onNodeWithContentDescription("Save goal")
            .assertIsDisplayed()
    }

    /** Assert the empty state is shown when no goals exist. */
    fun assertEmptyStateVisible() {
        rule.onNodeWithText("No goals yet").assertIsDisplayed()
    }
}
