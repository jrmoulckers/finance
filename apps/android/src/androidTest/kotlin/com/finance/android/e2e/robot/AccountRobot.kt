// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.e2e.robot

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.rules.ActivityScenarioRule
import com.finance.android.MainActivity

/**
 * Robot for Account-related screen interactions.
 *
 * Covers the Accounts list, account creation form, and account
 * detail screen.
 */
class AccountRobot(
    private val rule: AndroidComposeTestRule<ActivityScenarioRule<MainActivity>, MainActivity>,
) {

    /** Assert the accounts empty state is visible. */
    fun assertEmptyStateVisible() {
        rule.onNodeWithText("No accounts yet").assertIsDisplayed()
    }

    /** Tap the FAB to start creating a new account. */
    fun tapAddAccountFab() {
        rule.onNodeWithContentDescription("Add new account")
            .performClick()
        rule.waitForIdle()
    }

    /** Assert the account creation form is displayed. */
    fun assertCreateFormVisible() {
        rule.onNodeWithContentDescription("New Account screen")
            .assertIsDisplayed()
    }

    /** Type the given [name] into the Account Name field. */
    fun enterAccountName(name: String) {
        rule.onNodeWithContentDescription("Account name input")
            .performTextInput(name)
    }

    /** Type the given [balance] into Initial Balance. */
    fun enterInitialBalance(balance: String) {
        rule.onNodeWithContentDescription("Initial balance in dollars")
            .performTextInput(balance)
    }

    /** Tap the Save Account button. */
    fun tapSave() {
        rule.onNodeWithContentDescription("Save account")
            .performClick()
        rule.waitForIdle()
    }

    /** Assert an account with [name] appears in the list. */
    fun assertAccountInList(name: String) {
        rule.onNode(hasText(name)).assertIsDisplayed()
    }

    /** Assert account type dropdown is visible. */
    fun assertAccountTypeDropdownVisible() {
        rule.onNode(
            hasContentDescription("Account type: Checking", substring = true),
        ).assertIsDisplayed()
    }
}
