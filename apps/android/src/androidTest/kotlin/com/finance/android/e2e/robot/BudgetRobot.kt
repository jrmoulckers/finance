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
 * Robot for Budget screen interactions.
 *
 * Covers the Budgets list, budget creation form, and budget
 * summary card. Navigates through the Planning tab's Budgets
 * sub-tab.
 */
class BudgetRobot(
    private val rule: AndroidComposeTestRule<ActivityScenarioRule<MainActivity>, MainActivity>,
) {

    /** Wait for the budgets tab content to finish loading. */
    fun waitForBudgetsLoaded() {
        rule.waitUntil(timeoutMillis = 5_000) {
            rule.onAllNodes(hasContentDescription("Loading budgets"))
                .fetchSemanticsNodes()
                .isEmpty()
        }
    }

    /** Assert the Budgets tab is selected in the Planning screen. */
    fun assertBudgetsTabVisible() {
        rule.onNodeWithText("Budgets").assertIsDisplayed()
    }

    /** Tap the FAB to create a new budget. */
    fun tapCreateBudgetFab() {
        rule.onNodeWithContentDescription("Create new budget")
            .performClick()
        rule.waitForIdle()
    }

    /** Assert the budget creation form is displayed. */
    fun assertCreateFormVisible() {
        rule.onNode(hasContentDescription("New Budget screen"))
            .assertIsDisplayed()
    }

    /** Select a budget category chip by [name]. */
    fun selectCategory(name: String) {
        rule.onNode(hasContentDescription("Category: $name"))
            .performClick()
        rule.waitForIdle()
    }

    /** Assert a category chip is shown as selected. */
    fun assertCategorySelected(name: String) {
        rule.onNode(hasContentDescription("Category: $name, selected"))
            .assertIsDisplayed()
    }

    /** Enter the budgeted [amount] into the amount field. */
    fun enterBudgetAmount(amount: String) {
        rule.onNodeWithContentDescription("Budgeted amount in dollars")
            .performTextInput(amount)
    }

    /** Tap the Save Budget button. */
    fun tapSave() {
        rule.onNodeWithContentDescription("Save budget")
            .performClick()
        rule.waitForIdle()
    }

    /** Assert a budget with [categoryName] appears in the budgets list. */
    fun assertBudgetInList(categoryName: String) {
        rule.onNode(hasText(categoryName)).assertIsDisplayed()
    }

    /** Assert the budget summary card is displayed. */
    fun assertBudgetSummaryVisible() {
        rule.onNode(hasContentDescription("Budget summary", substring = true))
            .assertIsDisplayed()
    }

    /** Assert the overall health status label is visible. */
    fun assertHealthStatusVisible(status: String) {
        rule.onNode(hasContentDescription("Overall status: $status"))
            .assertIsDisplayed()
    }

    /** Assert the save button has proper accessibility label. */
    fun assertSaveButtonAccessible() {
        rule.onNodeWithContentDescription("Save budget")
            .assertIsDisplayed()
    }
}
