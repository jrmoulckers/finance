// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.snapshot

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onRoot
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.finance.android.data.repository.mock.MockAccountRepository
import com.finance.android.data.repository.mock.MockTransactionRepository
import com.finance.android.ui.screens.AccountsScreen
import com.finance.android.ui.theme.FinanceTheme
import com.finance.android.ui.viewmodel.AccountsViewModel
import com.github.takahirom.roborazzi.captureRoboImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.GraphicsMode

/** Snapshot coverage for the accounts screen using Roborazzi on the JVM. */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AccountsSnapshotTest {

    private val testDispatcher = StandardTestDispatcher()

    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun captureAccountsScreenLight() {
        runTest(testDispatcher) {
            val viewModel = createAccountsViewModel()
            advanceUntilIdle()

            composeRule.setContent {
                SnapshotTheme(darkTheme = false) {
                    AccountsScreen(viewModel = viewModel)
                }
            }

            composeRule.waitForIdle()
            composeRule.onRoot().captureRoboImage("src/test/snapshots/accounts/accounts-light.png")
        }
    }

    @Test
    fun captureAccountsScreenDark() {
        runTest(testDispatcher) {
            val viewModel = createAccountsViewModel()
            advanceUntilIdle()

            composeRule.setContent {
                SnapshotTheme(darkTheme = true) {
                    AccountsScreen(viewModel = viewModel)
                }
            }

            composeRule.waitForIdle()
            composeRule.onRoot().captureRoboImage("src/test/snapshots/accounts/accounts-dark.png")
        }
    }

    private fun createAccountsViewModel(): AccountsViewModel = AccountsViewModel(
        accountRepository = MockAccountRepository(),
        transactionRepository = MockTransactionRepository(),
    )
}

@Composable
private fun SnapshotTheme(
    darkTheme: Boolean,
    content: @Composable () -> Unit,
) {
    FinanceTheme(darkTheme = darkTheme, dynamicColor = false) {
        Surface(modifier = Modifier.fillMaxSize()) {
            content()
        }
    }
}
