// SPDX-License-Identifier: BUSL-1.1

package com.finance.android

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Sample end-to-end coverage for the transaction creation journey.
 */
@RunWith(AndroidJUnit4::class)
class TransactionCreateE2ETest : BaseE2ETest() {

    /** Verifies that the create-transaction wizard can be completed with representative data. */
    @Test
    fun createTransaction_flowAllowsEnteringDataAndSubmitting() {
        navigateToTab("Transactions")
        waitForLoadingToFinish("Loading transactions")

        openCreateTransactionFlow()
        composeTestRule.onNodeWithText("Amount").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Amount in dollars").performTextInput("42.50")
        composeTestRule.onNodeWithContentDescription("Payee name").performTextInput("Whole Foods")
        composeTestRule.onNodeWithText("Continue").assertIsDisplayed().performClick()

        composeTestRule.onNodeWithContentDescription("Category: Groceries").performClick()
        composeTestRule.onNodeWithText("Account").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Continue to next step").performClick()

        composeTestRule.onNodeWithText("Review Transaction").assertIsDisplayed()
        assertTalkBackLabelContains("Summary:")
        composeTestRule.onNodeWithContentDescription("Save transaction").performClick()
    }
}
