// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.streak

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.datetime.LocalDate
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Unit tests for [StreakViewModel].
 *
 * Uses a fake [StreakRepository] and fake [HouseholdIdProvider] to
 * verify that the ViewModel correctly computes and exposes streak state.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StreakViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    @BeforeTest
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    // ── Fakes ────────────────────────────────────────────────────────────

    private class FakeStreakRepository : StreakRepository {
        val datesFlow = MutableStateFlow<Set<LocalDate>>(emptySet())

        override fun observeLoggingDates(householdId: String): Flow<Set<LocalDate>> = datesFlow
    }

    private class FakeHouseholdIdProvider(id: String?) : com.finance.android.auth.HouseholdIdProvider {
        override val householdId: StateFlow<SyncId?> = MutableStateFlow(
            id?.let { SyncId(it) },
        ).asStateFlow()
        override val verifiedHouseholdId: StateFlow<SyncId?> = householdId
    }

    // ── Tests ────────────────────────────────────────────────────────────

    @Test
    fun `initial state shows loading`() = runTest {
        val repo = FakeStreakRepository()
        val provider = FakeHouseholdIdProvider("test-household")
        val vm = StreakViewModel(repo, provider)

        assertEquals(true, vm.uiState.value.isLoading)
    }

    @Test
    fun `emits 0 streak when no dates logged`() = runTest {
        val repo = FakeStreakRepository()
        val provider = FakeHouseholdIdProvider("test-household")
        val vm = StreakViewModel(repo, provider)

        repo.datesFlow.value = emptySet()
        advanceUntilIdle()

        assertEquals(0, vm.uiState.value.currentStreak)
        assertEquals(0, vm.uiState.value.longestStreak)
        assertFalse(vm.uiState.value.isLoading)
    }

    @Test
    fun `computes streak from dates`() = runTest {
        val repo = FakeStreakRepository()
        val provider = FakeHouseholdIdProvider("test-household")
        val vm = StreakViewModel(repo, provider)

        val today = kotlinx.datetime.Clock.System.now()
            .toLocalDateTime(kotlinx.datetime.TimeZone.currentSystemDefault()).date

        repo.datesFlow.value = setOf(today)
        advanceUntilIdle()

        assertEquals(1, vm.uiState.value.currentStreak)
        assertFalse(vm.uiState.value.isLoading)
    }

    @Test
    fun `dismissStreak hides the card`() = runTest {
        val repo = FakeStreakRepository()
        val provider = FakeHouseholdIdProvider("test-household")
        val vm = StreakViewModel(repo, provider)

        assertTrue(vm.uiState.value.isVisible)
        vm.dismissStreak()
        assertFalse(vm.uiState.value.isVisible)
    }

    @Test
    fun `no household ID results in 0 streak`() = runTest {
        val repo = FakeStreakRepository()
        val provider = FakeHouseholdIdProvider(null)
        val vm = StreakViewModel(repo, provider)

        advanceUntilIdle()

        assertEquals(0, vm.uiState.value.currentStreak)
        assertFalse(vm.uiState.value.isLoading)
    }

    @Test
    fun `updates when new dates flow in`() = runTest {
        val repo = FakeStreakRepository()
        val provider = FakeHouseholdIdProvider("test-household")
        val vm = StreakViewModel(repo, provider)

        val today = kotlinx.datetime.Clock.System.now()
            .toLocalDateTime(kotlinx.datetime.TimeZone.currentSystemDefault()).date
        val yesterday = today.minus(1, kotlinx.datetime.DateTimeUnit.DAY)

        repo.datesFlow.value = setOf(today)
        advanceUntilIdle()
        assertEquals(1, vm.uiState.value.currentStreak)

        repo.datesFlow.value = setOf(today, yesterday)
        advanceUntilIdle()
        assertEquals(2, vm.uiState.value.currentStreak)
    }

    @Test
    fun `message is non-empty for any streak value`() = runTest {
        val repo = FakeStreakRepository()
        val provider = FakeHouseholdIdProvider("test-household")
        val vm = StreakViewModel(repo, provider)

        repo.datesFlow.value = emptySet()
        advanceUntilIdle()

        assertTrue(vm.uiState.value.message.isNotBlank())
    }
}
