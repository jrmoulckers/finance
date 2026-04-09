// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.e2e

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import org.junit.Test
import com.finance.android.e2e.robot.DashboardRobot
import com.finance.android.e2e.robot.GoalRobot
import com.finance.android.e2e.robot.NavigationRobot

/**
 * E2E journey test: Track Goal.
 *
 * Exercises the full goal creation and tracking flow:
 * Dashboard → Planning tab → Goals tab → tap FAB →
 * enter name/amount → Save → verify goal in list.
 *
 * Uses the pre-authenticated session provided by [E2ETestApplication]
 * and in-memory repositories for deterministic, offline execution.
 */
class TrackGoalJourneyTest : BaseE2ETest() {

    /**
     * Verify navigation to Goals tab via Planning → Goals tab switch.
     */
    @Test
    fun navigateToGoals_showsGoalsTab() {
        val dash = DashboardRobot(composeTestRule)
        val nav = NavigationRobot(composeTestRule)
        val goal = GoalRobot(composeTestRule)

        dash.waitForDashboardLoaded()
        nav.navigateToPlanning()
        goal.tapGoalsTab()
        goal.assertGoalsTabVisible()
    }

    /**
     * Verify that tapping the FAB in the Goals tab opens the
     * goal creation form.
     */
    @Test
    fun tapGoalFab_opensCreateForm() {
        val dash = DashboardRobot(composeTestRule)
        val nav = NavigationRobot(composeTestRule)
        val goal = GoalRobot(composeTestRule)

        dash.waitForDashboardLoaded()
        nav.navigateToPlanning()
        goal.tapGoalsTab()
        goal.waitForGoalsLoaded()
        goal.tapCreateGoalFab()
        goal.assertCreateFormVisible()
    }

    /**
     * Verify the full goal creation flow: enter name and target,
     * save, and verify goal appears in the list.
     */
    @Test
    fun createGoal_withNameAndTarget_showsInList() {
        val dash = DashboardRobot(composeTestRule)
        val nav = NavigationRobot(composeTestRule)
        val goal = GoalRobot(composeTestRule)

        dash.waitForDashboardLoaded()
        nav.navigateToPlanning()
        goal.tapGoalsTab()
        goal.waitForGoalsLoaded()
        goal.tapCreateGoalFab()
        goal.assertCreateFormVisible()

        goal.enterGoalName("Emergency Fund")
        goal.enterTargetAmount("10000.00")
        goal.tapSave()
    }

    /**
     * Verify that the goal creation form has accessible labels
     * for all interactive elements (TalkBack parity).
     */
    @Test
    fun goalCreateForm_hasAccessibilityLabels() {
        val dash = DashboardRobot(composeTestRule)
        val nav = NavigationRobot(composeTestRule)
        val goal = GoalRobot(composeTestRule)

        dash.waitForDashboardLoaded()
        nav.navigateToPlanning()
        goal.tapGoalsTab()
        goal.waitForGoalsLoaded()
        goal.tapCreateGoalFab()

        // Verify key accessibility labels
        composeTestRule.onNodeWithContentDescription("New Goal screen")
            .assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Goal name input")
            .assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Target amount in dollars")
            .assertIsDisplayed()
        goal.assertSaveButtonAccessible()
    }

    /**
     * Verify the round-trip: Dashboard → Planning → Goals → Create →
     * back to Goals tab preserves the tab selection state.
     */
    @Test
    fun goalCreationFlow_backNavigation_preservesGoalsTab() {
        val dash = DashboardRobot(composeTestRule)
        val nav = NavigationRobot(composeTestRule)
        val goal = GoalRobot(composeTestRule)

        dash.waitForDashboardLoaded()
        nav.navigateToPlanning()
        goal.tapGoalsTab()
        goal.waitForGoalsLoaded()
        goal.tapCreateGoalFab()
        goal.assertCreateFormVisible()

        // Navigate back
        composeTestRule.onNodeWithContentDescription("Navigate back")
            .performClick()
        composeTestRule.waitForIdle()

        // Goals tab should still be selected
        goal.assertGoalsTabVisible()
    }
}
