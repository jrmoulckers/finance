// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import com.finance.android.auth.TestHouseholdIdProvider
import com.finance.android.ui.screens.investment.InvestmentViewModel
import com.finance.models.types.SyncId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Unit tests for [InvestmentViewModel] (#1119).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class InvestmentViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    @BeforeTest
    fun setUp() { Dispatchers.setMain(testDispatcher) }

    @AfterTest
    fun tearDown() { Dispatchers.resetMain() }

    private val householdId = SyncId("user-test")

    private fun createViewModel(hasUser: Boolean = true): InvestmentViewModel {
        return InvestmentViewModel(TestHouseholdIdProvider(if (hasUser) householdId else null))
    }

    @Test
    fun `initial state is loading`() = runTest {
        val vm = createViewModel()
        assertTrue(vm.uiState.value.isLoading)
    }

    @Test
    fun `loads portfolio with holdings`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.isLoading)
        assertTrue(state.portfolioName.isNotEmpty())
        assertTrue(state.holdings.isNotEmpty())
        assertTrue(state.allocation.isNotEmpty())
        assertTrue(state.performanceHistory.isNotEmpty())
    }

    @Test
    fun `holdings have gain loss data`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        val state = vm.uiState.value
        state.holdings.forEach { holding ->
            assertTrue(holding.currentValueFormatted.isNotEmpty())
            assertTrue(holding.gainLossFormatted.isNotEmpty())
            assertTrue(holding.returnPercent.isNotEmpty())
        }
    }

    @Test
    fun `allocation percentages are populated`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertTrue(state.allocation.isNotEmpty())
        state.allocation.forEach { slice ->
            assertTrue(slice.percentage > 0.0)
            assertTrue(slice.label.isNotEmpty())
        }
    }

    @Test
    fun `no user shows empty state`() = runTest {
        val vm = createViewModel(hasUser = false)
        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.isLoading)
        assertTrue(state.holdings.isEmpty())
    }

    @Test
    fun `overall profit flag is correct`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        val state = vm.uiState.value
        // Sample data has positive gains
        assertTrue(state.isOverallProfit)
        assertTrue(state.totalReturnPercent.contains("+"))
    }
}
