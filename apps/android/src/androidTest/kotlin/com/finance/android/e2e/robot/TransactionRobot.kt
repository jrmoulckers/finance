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
 * Robot for Transaction screen interactions.
 *
 * Covers the transaction creation wizard (3-step flow: Amount → Category → Confirm),
 * transaction list, and transaction detail views.
 */
class TransactionRobot(
    private val rule: AndroidComposeTestRule<ActivityScenarioRule<MainActivity>, MainActivity>,
) {

    // ── Step 1: Amount & Payee ──────────────────────────────────────────

    /** Assert the Amount step of the transaction wizard is displayed. */
    fun assertAmountStepVisible() {
        rule.onNode(hasContentDescription("New Transaction", substring = true))
            .assertIsDisplayed()
        rule.onNodeWithContentDescription("Amount in dollars")
            .assertIsDisplayed()
    }

    /** Enter the given [amount] into the Amount field. */
    fun enterAmount(amount: String) {
        rule.onNodeWithContentDescription("Amount in dollars")
            .performTextInput(amount)
    }

    /** Enter the given [payee] into the Payee field. */
    fun enterPayee(payee: String) {
        rule.onNodeWithContentDescription("Payee name")
            .performTextInput(payee)
    }

    /** Tap "Continue" to advance to the next wizard step. */
    fun tapContinue() {
        rule.onNodeWithContentDescription("Continue to next step")
            .performClick()
        rule.waitForIdle()
    }

    // ── Step 2: Category & Account ──────────────────────────────────────

    /** Assert the Category step is displayed. */
    fun assertCategoryStepVisible() {
        rule.onNodeWithContentDescription("Select a category")
            .assertIsDisplayed()
    }

    /** Select a category chip by [name]. */
    fun selectCategory(name: String) {
        rule.onNode(hasContentDescription("Category: $name"))
            .performClick()
        rule.waitForIdle()
    }

    /** Assert a category is shown as selected. */
    fun assertCategorySelected(name: String) {
        rule.onNode(hasContentDescription("Category: $name, selected"))
            .assertIsDisplayed()
    }

    // ── Step 3: Confirm ─────────────────────────────────────────────────

    /** Assert the Confirm step is displayed. */
    fun assertConfirmStepVisible() {
        rule.onNodeWithContentDescription("Review your transaction")
            .assertIsDisplayed()
    }

    /** Assert the confirmation summary contains the given [payee]. */
    fun assertSummaryContainsPayee(payee: String) {
        rule.onNode(hasContentDescription("Payee: $payee"))
            .assertIsDisplayed()
    }

    /** Tap "Save Transaction" on the confirm step. */
    fun tapSaveTransaction() {
        rule.onNodeWithContentDescription("Save Transaction")
            .performClick()
        rule.waitForIdle()
    }

    // ── Transaction list ────────────────────────────────────────────────

    /** Assert a transaction with the given [payee] appears in the list. */
    fun assertTransactionInList(payee: String) {
        rule.onNode(hasText(payee)).assertIsDisplayed()
    }

    // ── Accessibility ───────────────────────────────────────────────────

    /** Assert the step indicator has a proper content description. */
    fun assertStepIndicatorAccessible(stepNumber: Int) {
        rule.onNode(
            hasContentDescription("Step $stepNumber of 3", substring = true),
        ).assertIsDisplayed()
    }
}
