// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import com.finance.android.auth.TestHouseholdIdProvider
import com.finance.android.data.repository.GoalRepository
import com.finance.android.domain.goals.GoalPace
import com.finance.models.Goal
import com.finance.models.GoalStatus
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for [GoalPlannerViewModel] (#2207).
 *
 * Uses a deterministic in-memory repository, a fixed [Clock], and
 * `kotlinx-coroutines-test` to verify goal selection and plan exposure.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class GoalPlannerViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private val household = SyncId("household-1")
    private val epoch = Instant.fromEpochSeconds(0)

    // A clock fixed at 2026-01-01T00:00Z.
    private val fixedClock = object : Clock {
        override fun now(): Instant = Instant.parse("2026-01-01T00:00:00Z")
    }

    @BeforeTest
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun goal(
        id: String,
        name: String,
        target: Long,
        current: Long = 0,
        status: GoalStatus = GoalStatus.ACTIVE,
        targetDate: LocalDate? = null,
    ) = Goal(
        id = SyncId(id),
        householdId = household,
        ownerId = household,
        name = name,
        targetAmount = Cents(target),
        currentAmount = Cents(current),
        currency = Currency.USD,
        status = status,
        targetDate = targetDate,
        createdAt = epoch,
        updatedAt = epoch,
    )

    private class TestGoalRepository(initial: List<Goal>) : GoalRepository {
        private val goals = MutableStateFlow(initial)
        override fun observeAll(householdId: SyncId): Flow<List<Goal>> =
            goals.map { list -> list.filter { it.deletedAt == null } }
        override fun observeById(id: SyncId): Flow<Goal?> =
            goals.map { list -> list.find { it.id == id } }
        override suspend fun getById(id: SyncId): Goal? = goals.value.find { it.id == id }
        override fun observeActive(householdId: SyncId): Flow<List<Goal>> =
            goals.map { list -> list.filter { it.status == GoalStatus.ACTIVE } }
        override suspend fun insert(entity: Goal) { goals.value = goals.value + entity }
        override suspend fun update(entity: Goal) {
            goals.value = goals.value.map { if (it.id == entity.id) entity else it }
        }
        override suspend fun updateProgress(id: SyncId, currentAmount: Cents) { /* no-op */ }
        override suspend fun delete(id: SyncId) { /* no-op */ }
        override suspend fun getUnsynced(householdId: SyncId): List<Goal> = emptyList()
        override suspend fun markSynced(ids: List<SyncId>) { /* no-op */ }
    }

    private fun viewModel(goals: List<Goal>, householdId: SyncId? = household) =
        GoalPlannerViewModel(
            householdIdProvider = TestHouseholdIdProvider(householdId),
            goalRepository = TestGoalRepository(goals),
            clock = fixedClock,
        )

    @Test
    fun `initial state is loading`() {
        val vm = viewModel(emptyList())
        assertTrue(vm.uiState.value.isLoading)
    }

    @Test
    fun `no active goals yields no plan`() = runTest {
        val vm = viewModel(
            listOf(goal("g1", "Old", target = 100_000, status = GoalStatus.COMPLETED)),
        )
        advanceUntilIdle()
        val state = vm.uiState.value
        assertFalse(state.isLoading)
        assertFalse(state.hasGoal)
        assertNull(state.plan)
    }

    @Test
    fun `selects the goal with the soonest deadline`() = runTest {
        val vm = viewModel(
            listOf(
                goal("g1", "Laptop", target = 200_000, targetDate = LocalDate(2027, 6, 1)),
                goal("g2", "Car", target = 500_000, targetDate = LocalDate(2026, 9, 1)),
            ),
        )
        advanceUntilIdle()
        val plan = vm.uiState.value.plan
        assertNotNull(plan)
        assertEquals("Car", plan.goalName)
        assertTrue(vm.uiState.value.hasGoal)
        assertNotNull(plan.buyByLabel)
    }

    @Test
    fun `falls back to highest progress when no deadlines`() = runTest {
        val vm = viewModel(
            listOf(
                goal("g1", "Shoes", target = 100_000, current = 10_000),
                goal("g2", "Phone", target = 100_000, current = 80_000),
            ),
        )
        advanceUntilIdle()
        val plan = vm.uiState.value.plan
        assertNotNull(plan)
        assertEquals("Phone", plan.goalName)
        assertEquals(GoalPace.NO_DEADLINE, plan.pace)
    }

    @Test
    fun `missing household id yields no plan without error`() = runTest {
        val vm = viewModel(
            listOf(goal("g1", "Car", target = 100_000)),
            householdId = null,
        )
        advanceUntilIdle()
        val state = vm.uiState.value
        assertFalse(state.hasGoal)
        assertNull(state.plan)
        assertNull(state.errorMessage)
    }
}
