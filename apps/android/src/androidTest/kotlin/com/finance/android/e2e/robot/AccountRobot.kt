// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.e2e.robot

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasScrollToNodeAction
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
 * Robot for Account-related screen interactions.
 *
 * Covers the Accounts list, account creation form, and account
 * detail screen.
 */
class AccountRobot(
    private val rule: AndroidComposeTestRule<ActivityScenarioRule<MainActivity>, MainActivity>,
) {

    /** Wait for the Accounts screen to finish loading after navigation. */
    fun waitForAccountsScreen() {
        rule.waitUntil(timeoutMillis = 5_000) {
            rule.onAllNodes(hasContentDescription("Add new account"))
                .fetchSemanticsNodes()
                .isNotEmpty()
        }
    }

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

    /**
     * Assert the account creation form is displayed.
     *
     * Waits for the form's name input to appear, which signals
     * the navigation transition has completed and the form
     * has been composed.
     */
    fun assertCreateFormVisible() {
        rule.waitUntil(timeoutMillis = 5_000) {
            rule.onAllNodes(hasContentDescription("Account name input"))
                .fetchSemanticsNodes()
                .isNotEmpty()
        }
        rule.waitForIdle()
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

    /**
     * Tap the Save Account button.
     *
     * Scrolls the [LazyColumn] to the save button before clicking.
     * Adds [waitForIdle] between scroll and click for API 34 stability,
     * where the nested Scaffold double top bar (FinanceTopBar + screen
     * TopAppBar) pushes form content further down the page.
     */
    fun tapSave() {
        rule.waitForIdle()
        rule.onNode(hasScrollToNodeAction())
            .performScrollToNode(hasContentDescription("Save account"))
        rule.waitForIdle()
        rule.onNode(hasContentDescription("Save account"))
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
