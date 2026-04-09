// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.e2e

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import org.junit.Test
import com.finance.android.e2e.robot.DashboardRobot
import com.finance.android.e2e.robot.TransactionRobot

/**
 * E2E journey test: Add Transaction.
 *
 * Exercises the full transaction creation wizard:
 * Dashboard → tap "Add new transaction" FAB → Step 1 (Amount/Payee) →
 * Step 2 (Category/Account) → Step 3 (Confirm) → Save.
 *
 * Uses the pre-authenticated session provided by [E2ETestApplication]
 * and in-memory repositories for deterministic, offline execution.
 */
class AddTransactionJourneyTest : BaseE2ETest() {

    /**
     * Verify that tapping the FAB on Dashboard opens the
     * transaction creation wizard at step 1.
     */
    @Test
    fun tapDashboardFab_opensTransactionWizardStep1() {
        val dash = DashboardRobot(composeTestRule)
        val txn = TransactionRobot(composeTestRule)

        dash.waitForDashboardLoaded()
        composeTestRule.onNodeWithContentDescription("Create new transaction")
            .performClick()
        composeTestRule.waitForIdle()
        txn.assertAmountStepVisible()
        txn.assertStepIndicatorAccessible(1)
    }

    /**
     * Verify the full 3-step wizard flow: enter amount and payee,
     * advance to category, advance to confirm, then save.
     */
    @Test
    fun createTransaction_fullWizard_completesSuccessfully() {
        val dash = DashboardRobot(composeTestRule)
        val txn = TransactionRobot(composeTestRule)

        // Navigate to transaction create
        dash.waitForDashboardLoaded()
        composeTestRule.onNodeWithContentDescription("Create new transaction")
            .performClick()
        composeTestRule.waitForIdle()

        // Step 1: Amount and Payee
        txn.assertAmountStepVisible()
        txn.enterAmount("42.50")
        txn.enterPayee("Whole Foods")
        txn.tapContinue()

        // Step 2: Category
        txn.assertCategoryStepVisible()
        txn.tapContinue()

        // Step 3: Confirm
        txn.assertConfirmStepVisible()
        txn.assertSummaryContainsPayee("Whole Foods")
        txn.tapSaveTransaction()
    }

    /**
     * Verify that the step indicator advances correctly through
     * each wizard step with proper accessibility labels.
     */
    @Test
    fun transactionWizard_stepIndicator_advancesCorrectly() {
        val dash = DashboardRobot(composeTestRule)
        val txn = TransactionRobot(composeTestRule)

        dash.waitForDashboardLoaded()
        composeTestRule.onNodeWithContentDescription("Create new transaction")
            .performClick()
        composeTestRule.waitForIdle()

        // Step 1
        txn.assertStepIndicatorAccessible(1)

        // Fill step 1 minimally and advance
        txn.enterAmount("10.00")
        txn.enterPayee("Test Payee")
        txn.tapContinue()

        // Step 2
        txn.assertStepIndicatorAccessible(2)
        txn.tapContinue()

        // Step 3
        txn.assertStepIndicatorAccessible(3)
    }

    /**
     * Verify that the "Add new transaction" quick action on Dashboard
     * has an accessible content description for TalkBack.
     */
    @Test
    fun dashboardAddTransaction_hasAccessibilityLabel() {
        val dash = DashboardRobot(composeTestRule)
        dash.waitForDashboardLoaded()

        composeTestRule.onNodeWithContentDescription("Create new transaction")
            .assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Add new transaction")
            .assertIsDisplayed()
    }
}
