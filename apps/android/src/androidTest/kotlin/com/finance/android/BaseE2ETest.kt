// SPDX-License-Identifier: BUSL-1.1

package com.finance.android

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNode
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Rule

/**
 * Shared end-to-end test infrastructure for the Android app shell.
 *
 * The base class launches [MainActivity] with a Compose instrumentation rule and
 * provides helpers for stable navigation, loading synchronization, and TalkBack
 * accessibility assertions that can be reused by androidTest suites.
 */
abstract class BaseE2ETest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    /** Navigates to a bottom tab using its visible label and accessibility label. */
    protected fun navigateToTab(tabLabel: String) {
        composeTestRule.onNodeWithText(tabLabel).assertIsDisplayed().performClick()
        composeTestRule.onNodeWithContentDescription("Navigate to $tabLabel").assertIsDisplayed()
        composeTestRule.waitForIdle()
    }

    /** Waits for one or more loading indicators to disappear before asserting UI state. */
    protected fun waitForLoadingToFinish(vararg loadingDescriptions: String) {
        loadingDescriptions.forEach { loadingDescription ->
            composeTestRule.waitUntil(timeoutMillis = DEFAULT_TIMEOUT_MILLIS) {
                composeTestRule
                    .onAllNodesWithContentDescription(loadingDescription)
                    .fetchSemanticsNodes()
                    .isEmpty()
            }
        }
        composeTestRule.waitForIdle()
    }

    /** Opens the shared create-transaction flow from the scaffold floating action button. */
    protected fun openCreateTransactionFlow() {
        composeTestRule
            .onNodeWithContentDescription(CreateTransactionFabDescription)
            .assertIsDisplayed()
            .performClick()
    }

    /** Verifies that a TalkBack label exists and is visible to accessibility services. */
    protected fun assertTalkBackLabel(contentDescription: String) {
        composeTestRule
            .onNodeWithContentDescription(contentDescription)
            .assertIsDisplayed()
    }

    /** Verifies that a TalkBack label contains a stable snippet of accessibility text. */
    protected fun assertTalkBackLabelContains(contentDescriptionSnippet: String) {
        composeTestRule
            .onNode(hasContentDescription(contentDescriptionSnippet, substring = true))
            .assertIsDisplayed()
    }

    private companion object {
        private const val DEFAULT_TIMEOUT_MILLIS = 5_000L
        private const val CreateTransactionFabDescription = "Create new transaction"
    }
}
