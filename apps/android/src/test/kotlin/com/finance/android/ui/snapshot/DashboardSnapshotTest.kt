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
import com.finance.android.data.repository.mock.MockBudgetRepository
import com.finance.android.data.repository.mock.MockCategoryRepository
import com.finance.android.data.repository.mock.MockTransactionRepository
import com.finance.android.ui.screens.DashboardScreen
import com.finance.android.ui.theme.FinanceTheme
import com.finance.android.ui.viewmodel.DashboardViewModel
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

/** Snapshot coverage for the dashboard screen using Roborazzi on the JVM. */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class DashboardSnapshotTest {

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
    fun captureDashboardScreenLight() {
        runTest(testDispatcher) {
            val viewModel = createDashboardViewModel()
            advanceUntilIdle()

            composeRule.setContent {
                SnapshotTheme(darkTheme = false) {
                    DashboardScreen(viewModel = viewModel)
                }
            }

            composeRule.waitForIdle()
            composeRule.onRoot().captureRoboImage("src/test/snapshots/dashboard/dashboard-light.png")
        }
    }

    @Test
    fun captureDashboardScreenDark() {
        runTest(testDispatcher) {
            val viewModel = createDashboardViewModel()
            advanceUntilIdle()

            composeRule.setContent {
                SnapshotTheme(darkTheme = true) {
                    DashboardScreen(viewModel = viewModel)
                }
            }

            composeRule.waitForIdle()
            composeRule.onRoot().captureRoboImage("src/test/snapshots/dashboard/dashboard-dark.png")
        }
    }

    private fun createDashboardViewModel(): DashboardViewModel = DashboardViewModel(
        accountRepository = MockAccountRepository(),
        transactionRepository = MockTransactionRepository(),
        budgetRepository = MockBudgetRepository(),
        categoryRepository = MockCategoryRepository(),
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
