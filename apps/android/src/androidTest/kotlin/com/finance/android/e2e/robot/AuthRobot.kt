// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.e2e.robot

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.rules.ActivityScenarioRule
import com.finance.android.MainActivity

/**
 * Robot for authentication-related screen interactions.
 *
 * Covers the Login screen, Sign-up navigation link, error states,
 * and the auth loading indicator. Since E2E tests start with a
 * pre-authenticated session, this robot is primarily used for
 * sign-in flow verification with unauthenticated test modules.
 */
class AuthRobot(
    private val rule: AndroidComposeTestRule<ActivityScenarioRule<MainActivity>, MainActivity>,
) {

    // ── Login screen ────────────────────────────────────────────────────

    /** Assert the login screen heading is displayed. */
    fun assertLoginScreenVisible() {
        rule.onNodeWithContentDescription("Welcome to Finance")
            .assertIsDisplayed()
    }

    /** Assert the "Sign in with Google" button is displayed. */
    fun assertGoogleSignInVisible() {
        rule.onNodeWithContentDescription("Sign in with Google")
            .assertIsDisplayed()
    }

    /** Assert the "Sign in with Passkey" button is displayed. */
    fun assertPasskeySignInVisible() {
        rule.onNodeWithContentDescription("Sign in with Passkey")
            .assertIsDisplayed()
    }

    /** Tap the "Sign in with Google" button. */
    fun tapSignInWithGoogle() {
        rule.onNodeWithContentDescription("Sign in with Google")
            .performClick()
        rule.waitForIdle()
    }

    /** Tap the "Sign in with Passkey" button. */
    fun tapSignInWithPasskey() {
        rule.onNodeWithContentDescription("Sign in with Passkey")
            .performClick()
        rule.waitForIdle()
    }

    /** Assert the sign-up navigation link is displayed. */
    fun assertSignUpLinkVisible() {
        rule.onNodeWithContentDescription("Don't have an account? Sign up")
            .assertIsDisplayed()
    }

    /** Tap the "Sign up" link to navigate to the sign-up screen. */
    fun tapSignUpLink() {
        rule.onNodeWithContentDescription("Don't have an account? Sign up")
            .performClick()
        rule.waitForIdle()
    }

    // ── Error state ─────────────────────────────────────────────────────

    /** Assert the sign-in error message is displayed. */
    fun assertErrorVisible() {
        rule.onNodeWithContentDescription("Sign-in error. Please try again.")
            .assertIsDisplayed()
    }

    // ── Loading state ───────────────────────────────────────────────────

    /** Assert the loading state is displayed. */
    fun assertLoadingVisible() {
        rule.onNode(hasContentDescription("Loading, please wait"))
            .assertIsDisplayed()
    }

    // ── Terms ───────────────────────────────────────────────────────────

    /** Assert the terms text is displayed. */
    fun assertTermsVisible() {
        rule.onNode(
            hasContentDescription(
                "By signing in, you agree to our Terms of Service and Privacy Policy",
            ),
        ).assertIsDisplayed()
    }

    // ── Settings sign-out (authenticated state) ─────────────────────────

    /** Assert the settings screen is visible. */
    fun assertSettingsScreenVisible() {
        rule.onNodeWithText("Settings").assertIsDisplayed()
    }
}
