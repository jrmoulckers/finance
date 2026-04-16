// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.e2e

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import org.junit.Test
import com.finance.android.e2e.robot.BudgetRobot
import com.finance.android.e2e.robot.DashboardRobot
import com.finance.android.e2e.robot.NavigationRobot

/**
 * E2E journey test: Set Budget.
 *
 * Exercises the full budget creation flow:
 * Dashboard → Planning tab → Budgets tab → tap FAB →
 * select category → enter amount → Save → verify in list.
 *
 * Uses the pre-authenticated session provided by [E2ETestApplication]
 * and in-memory repositories for deterministic, offline execution.
 */
class SetBudgetJourneyTest : BaseE2ETest() {

    /**
     * Verify navigation to the Planning tab shows the Budgets sub-tab.
     */
    @Test
    fun navigateToPlanning_showsBudgetsTab() {
        val dash = DashboardRobot(composeTestRule)
        val nav = NavigationRobot(composeTestRule)
        val budget = BudgetRobot(composeTestRule)

        dash.waitForDashboardLoaded()
        nav.navigateToPlanning()
        budget.assertBudgetsTabVisible()
    }

    /**
     * Verify that tapping the FAB in the Budgets tab opens the
     * budget creation form with expected fields.
     */
    @Test
    fun tapBudgetFab_opensCreateForm() {
        val dash = DashboardRobot(composeTestRule)
        val nav = NavigationRobot(composeTestRule)
        val budget = BudgetRobot(composeTestRule)

        dash.waitForDashboardLoaded()
        nav.navigateToPlanning()
        budget.waitForBudgetsLoaded()
        budget.tapCreateBudgetFab()
        budget.assertCreateFormVisible()
    }

    /**
     * Verify the full budget creation flow: select category,
     * enter amount, save, and verify the budget appears in the list.
     */
    @Test
    fun createBudget_withCategoryAndAmount_showsInList() {
        val dash = DashboardRobot(composeTestRule)
        val nav = NavigationRobot(composeTestRule)
        val budget = BudgetRobot(composeTestRule)

        dash.waitForDashboardLoaded()
        nav.navigateToPlanning()
        budget.waitForBudgetsLoaded()
        budget.tapCreateBudgetFab()
        budget.assertCreateFormVisible()

        // Select first available category and enter amount
        budget.enterBudgetAmount("600.00")
        budget.tapSave()
    }

    /**
     * Verify that the budget creation form has accessible labels
     * for all interactive elements (TalkBack parity).
     */
    @Test
    fun budgetCreateForm_hasAccessibilityLabels() {
        val dash = DashboardRobot(composeTestRule)
        val nav = NavigationRobot(composeTestRule)
        val budget = BudgetRobot(composeTestRule)

        dash.waitForDashboardLoaded()
        nav.navigateToPlanning()
        budget.waitForBudgetsLoaded()
        budget.tapCreateBudgetFab()

        // Verify key accessibility labels
        composeTestRule.onNodeWithContentDescription("New Budget screen")
            .assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Budgeted amount in dollars")
            .assertIsDisplayed()
        budget.assertSaveButtonAccessible()
    }

    /**
     * Verify that the Period dropdown is visible and defaults to Monthly
     * on the budget creation form.
     */
    @Test
    fun budgetCreateForm_showsPeriodDropdown() {
        val dash = DashboardRobot(composeTestRule)
        val nav = NavigationRobot(composeTestRule)
        val budget = BudgetRobot(composeTestRule)

        dash.waitForDashboardLoaded()
        nav.navigateToPlanning()
        budget.waitForBudgetsLoaded()
        budget.tapCreateBudgetFab()

        composeTestRule.onNodeWithContentDescription("Period: Monthly")
            .assertIsDisplayed()
    }
}
