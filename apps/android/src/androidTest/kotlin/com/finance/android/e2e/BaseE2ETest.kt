// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.e2e

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.finance.android.MainActivity
import org.junit.Rule
import org.junit.runner.RunWith

/**
 * Base class for all Finance Android E2E tests.
 *
 * Provides a pre-configured [AndroidComposeTestRule] that launches
 * [MainActivity] with the full app UI. Because [E2ETestRunner]
 * replaces the production Application with [E2ETestApplication],
 * the app starts in an authenticated state with in-memory repos.
 *
 * Conventions:
 * - Test methods follow actionOrState_condition_expectedResult.
 * - Use Robot pattern classes (in e2e/robot/) for readable
 *   page-object interaction.
 * - Always assert on contentDescription for TalkBack parity.
 * - NEVER assert on sensitive financial data (balances, amounts).
 */
@RunWith(AndroidJUnit4::class)
abstract class BaseE2ETest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()
}
