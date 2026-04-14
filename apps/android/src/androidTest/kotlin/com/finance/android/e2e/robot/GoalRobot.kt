// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.e2e.robot

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasScrollToNodeAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
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

    /**
     * Tap the Goals tab in the Planning screen.
     *
     * Uses [hasTestTag] to avoid ambiguity between the tab text "Goals"
     * and the GoalsSummaryHeader heading "Goals" when both are rendered
     * on the same screen (API 34 checkIsDisplayed resolves via text).
     */
    fun tapGoalsTab() {
        rule.onNode(hasTestTag("goals_tab"))
            .performClick()
        rule.waitForIdle()
    }

    /**
     * Assert the Goals tab content is visible.
     *
     * Matches the tab by its unique test tag rather than text/content
     * description to avoid the duplicate-node issue on API 34.
     */
    fun assertGoalsTabVisible() {
        rule.onNode(hasTestTag("goals_tab")).assertIsDisplayed()
    }

    /** Tap the FAB to create a new goal. */
    fun tapCreateGoalFab() {
        rule.onNodeWithContentDescription("Create new goal")
            .performClick()
        rule.waitForIdle()
    }

    /** Assert the goal creation form is displayed. */
    fun assertCreateFormVisible() {
        rule.waitUntil(timeoutMillis = 5_000) {
            rule.onAllNodes(hasContentDescription("Goal name input"))
                .fetchSemanticsNodes()
                .isNotEmpty()
        }
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

    /**
     * Tap the Save Goal button.
     *
     * Uses [performScrollToNode] on the [LazyColumn] to scroll
     * the save button into view before clicking, since it may not
     * be composed yet in the lazy list. Adds [waitForIdle] between
     * scroll and click for API 34 emulator stability.
     */
    fun tapSave() {
        rule.waitForIdle()
        rule.onNode(hasScrollToNodeAction())
            .performScrollToNode(hasContentDescription("Save goal"))
        rule.waitForIdle()
        rule.onNode(hasContentDescription("Save goal"))
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

    /**
     * Assert the save button has proper accessibility label.
     *
     * Scrolls the [LazyColumn] to the save button first, since it may
     * be below the fold on smaller screens with nested Scaffolds.
     */
    fun assertSaveButtonAccessible() {
        rule.waitForIdle()
        rule.onNode(hasScrollToNodeAction())
            .performScrollToNode(hasContentDescription("Save goal"))
        rule.waitForIdle()
        rule.onNode(hasContentDescription("Save goal"))
            .assertIsDisplayed()
    }

    /** Assert the empty state is shown when no goals exist. */
    fun assertEmptyStateVisible() {
        rule.onNodeWithText("No goals yet").assertIsDisplayed()
    }
}
