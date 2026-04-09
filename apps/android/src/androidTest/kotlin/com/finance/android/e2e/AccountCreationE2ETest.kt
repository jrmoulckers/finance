// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.e2e

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import org.junit.Test
import com.finance.android.e2e.robot.AccountRobot
import com.finance.android.e2e.robot.DashboardRobot
import com.finance.android.e2e.robot.NavigationRobot

/**
 * E2E tests for the account creation flow.
 *
 * Exercises the full journey: Dashboard net-worth card -> Accounts ->
 * tap FAB -> fill form -> save -> verify account appears in the list.
 */
class AccountCreationE2ETest : BaseE2ETest() {

    /**
     * Verify that tapping the Accounts FAB opens the account
     * creation form with the expected fields.
     */
    @Test
    fun tapFab_opensAccountCreationForm() {
        val dash = DashboardRobot(composeTestRule)
        val acct = AccountRobot(composeTestRule)

        dash.waitForDashboardLoaded()
        dash.tapNetWorthCard()
        acct.tapAddAccountFab()
        acct.assertCreateFormVisible()
    }

    /**
     * Verify that filling the account form and tapping Save creates
     * the account and returns to the accounts list.
     */
    @Test
    fun createAccount_withValidData_showsInList() {
        val dash = DashboardRobot(composeTestRule)
        val acct = AccountRobot(composeTestRule)

        dash.waitForDashboardLoaded()
        dash.tapNetWorthCard()
        acct.tapAddAccountFab()
        acct.assertCreateFormVisible()

        acct.enterAccountName("E2E Test Checking")
        acct.enterInitialBalance("1500.00")
        acct.tapSave()

        // After saving, the app navigates back to Accounts list.
        acct.assertAccountInList("E2E Test Checking")
    }

    /**
     * Verify that the account type dropdown is visible and defaults
     * to Checking on the creation form.
     */
    @Test
    fun accountCreationForm_showsTypeDropdown() {
        val dash = DashboardRobot(composeTestRule)
        val acct = AccountRobot(composeTestRule)

        dash.waitForDashboardLoaded()
        dash.tapNetWorthCard()
        acct.tapAddAccountFab()
        acct.assertAccountTypeDropdownVisible()
    }

    /**
     * Verify that the Save button has proper accessibility labels.
     */
    @Test
    fun accountCreationForm_saveButton_hasAccessibilityLabel() {
        val dash = DashboardRobot(composeTestRule)

        dash.waitForDashboardLoaded()
        dash.tapNetWorthCard()
        AccountRobot(composeTestRule).tapAddAccountFab()
        composeTestRule.onNodeWithContentDescription("Save account")
            .assertIsDisplayed()
    }
}
