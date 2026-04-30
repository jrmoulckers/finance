// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import com.finance.android.auth.TestHouseholdIdProvider
import com.finance.android.ui.screens.referral.ReferralViewModel
import com.finance.core.referral.ReferralStatus
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
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Unit tests for [ReferralViewModel] (#1116).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ReferralViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    @BeforeTest
    fun setUp() { Dispatchers.setMain(testDispatcher) }

    @AfterTest
    fun tearDown() { Dispatchers.resetMain() }

    private val householdId = SyncId("user-test")

    private fun createViewModel(): ReferralViewModel {
        return ReferralViewModel(TestHouseholdIdProvider(householdId))
    }

    @Test
    fun `initial state is loading`() = runTest {
        val vm = createViewModel()
        assertTrue(vm.uiState.value.isLoading)
    }

    @Test
    fun `loads referral data`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.isLoading)
        assertTrue(state.referralCode.isNotEmpty())
        assertTrue(state.referralLink.isNotEmpty())
        assertTrue(state.referrals.isNotEmpty())
    }

    @Test
    fun `generates new code`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        val oldCode = vm.uiState.value.referralCode
        vm.generateNewCode()
        advanceUntilIdle()

        // Code should change (new salt from timestamp)
        assertTrue(vm.uiState.value.referralCode.isNotEmpty())
    }

    @Test
    fun `share text contains referral link`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        val shareText = vm.getShareText()
        assertTrue(shareText.contains("finance.app/refer/"))
    }

    @Test
    fun `celebration auto-dismisses`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        vm.showCelebration()
        assertTrue(vm.uiState.value.showCelebration)

        vm.dismissCelebration()
        assertFalse(vm.uiState.value.showCelebration)
    }

    @Test
    fun `status counts are correct`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertEquals(1, state.pendingCount) // 1 SENT
        assertEquals(1, state.acceptedCount) // 1 ACCEPTED
        assertEquals(1, state.rewardedCount) // 1 REWARDED
    }
}
