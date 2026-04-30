// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import com.finance.android.auth.TestHouseholdIdProvider
import com.finance.android.ui.screens.household.HouseholdViewModel
import com.finance.models.HouseholdRole
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
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for [HouseholdViewModel] (#1114).
 *
 * Verifies household creation, member invitation, role management,
 * and shared budget toggling.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class HouseholdViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    @BeforeTest
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val householdId = SyncId("household-test")

    private fun createViewModel(
        hasHousehold: Boolean = true,
    ): HouseholdViewModel {
        val provider = TestHouseholdIdProvider(
            if (hasHousehold) householdId else null,
        )
        return HouseholdViewModel(provider)
    }

    @Test
    fun `initial state is loading`() = runTest {
        val vm = createViewModel()
        assertTrue(vm.uiState.value.isLoading)
    }

    @Test
    fun `loads household data when household ID exists`() = runTest {
        val vm = createViewModel(hasHousehold = true)
        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.isLoading)
        assertTrue(state.householdName.isNotEmpty())
        assertTrue(state.members.isNotEmpty())
        assertTrue(state.isOwner)
    }

    @Test
    fun `empty state when no household ID`() = runTest {
        val vm = createViewModel(hasHousehold = false)
        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.isLoading)
        assertTrue(state.householdName.isEmpty())
    }

    @Test
    fun `create household updates state`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        vm.showCreateDialog()
        assertTrue(vm.uiState.value.showCreateDialog)

        vm.updateNewHouseholdName("Test Family")
        assertEquals("Test Family", vm.uiState.value.newHouseholdName)

        vm.createHousehold()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.showCreateDialog)
        assertEquals("Test Family", state.householdName)
        assertTrue(state.isOwner)
    }

    @Test
    fun `create household with blank name shows error`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        vm.showCreateDialog()
        vm.updateNewHouseholdName("")
        vm.createHousehold()
        advanceUntilIdle()

        assertNotNull(vm.uiState.value.errorMessage)
    }

    @Test
    fun `send invite adds pending member`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        val initialCount = vm.uiState.value.members.size

        vm.showInviteDialog()
        vm.updateInviteEmail("test@example.com")
        vm.updateInviteRole(HouseholdRole.MEMBER)
        vm.sendInvite()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertEquals(initialCount + 1, state.members.size)
        assertNotNull(state.inviteCode)
        assertTrue(state.members.last().isPending)
    }

    @Test
    fun `send invite with invalid email shows error`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        vm.showInviteDialog()
        vm.updateInviteEmail("invalid")
        vm.sendInvite()

        assertNotNull(vm.uiState.value.errorMessage)
    }

    @Test
    fun `toggle shared budget updates state`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        assertTrue(vm.uiState.value.useSharedBudget)
        vm.toggleSharedBudget(false)
        assertFalse(vm.uiState.value.useSharedBudget)
        vm.toggleSharedBudget(true)
        assertTrue(vm.uiState.value.useSharedBudget)
    }

    @Test
    fun `remove member updates list`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        // Add a member first
        vm.showInviteDialog()
        vm.updateInviteEmail("remove@example.com")
        vm.sendInvite()
        advanceUntilIdle()

        val countBefore = vm.uiState.value.members.size
        val memberToRemove = vm.uiState.value.members.last()
        vm.removeMember(memberToRemove.id)
        advanceUntilIdle()

        assertEquals(countBefore - 1, vm.uiState.value.members.size)
    }

    @Test
    fun `update member role changes role`() = runTest {
        val vm = createViewModel()
        advanceUntilIdle()

        // Add a member
        vm.showInviteDialog()
        vm.updateInviteEmail("rolechange@example.com")
        vm.updateInviteRole(HouseholdRole.MEMBER)
        vm.sendInvite()
        advanceUntilIdle()

        val member = vm.uiState.value.members.last()
        vm.updateMemberRole(member.id, HouseholdRole.PARTNER)
        advanceUntilIdle()

        val updated = vm.uiState.value.members.find { it.id == member.id }
        assertNotNull(updated)
        assertEquals(HouseholdRole.PARTNER, updated.role)
    }
}
