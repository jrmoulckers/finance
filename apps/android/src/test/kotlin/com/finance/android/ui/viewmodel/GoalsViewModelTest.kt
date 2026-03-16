// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import com.finance.android.data.repository.GoalRepository
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
 * Unit tests for [GoalsViewModel].
 *
 * Verifies that the ViewModel correctly loads goals from [GoalRepository],
 * computes active/completed counts, calculates progress percentages,
 * formats currency via KMP [com.finance.core.currency.CurrencyFormatter],
 * and manages loading/refreshing/error UI state transitions.
 *
 * Uses a deterministic [TestGoalRepository] (not a mocking framework) and
 * `kotlinx-coroutines-test` to control the coroutine dispatcher.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class GoalsViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    @BeforeTest
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    // ═══════════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════════

    private val now = Clock.System.now()
    private val householdId = SyncId("household-test")

    private fun createGoal(
        id: String,
        name: String,
        targetCents: Long,
        currentCents: Long = 0L,
        status: GoalStatus = GoalStatus.ACTIVE,
        targetDate: LocalDate? = null,
        icon: String? = null,
    ) = Goal(
        id = SyncId(id),
        householdId = householdId,
        name = name,
        targetAmount = Cents(targetCents),
        currentAmount = Cents(currentCents),
        currency = Currency.USD,
        status = status,
        targetDate = targetDate,
        icon = icon,
        createdAt = now,
        updatedAt = now,
    )

    /**
     * A controllable [GoalRepository] for test isolation.
     * Starts with whatever initial data the test injects.
     */
    private class TestGoalRepository(
        initial: List<Goal> = emptyList(),
    ) : GoalRepository {
        private val _goals = MutableStateFlow(initial)

        override fun observeAll(householdId: SyncId): Flow<List<Goal>> =
            _goals.map { list -> list.filter { it.deletedAt == null } }

        override fun observeById(id: SyncId): Flow<Goal?> =
            _goals.map { list -> list.find { it.id == id && it.deletedAt == null } }

        override suspend fun getById(id: SyncId): Goal? =
            _goals.value.find { it.id == id && it.deletedAt == null }

        override fun observeActive(householdId: SyncId): Flow<List<Goal>> =
            _goals.map { list ->
                list.filter { it.deletedAt == null && it.status == GoalStatus.ACTIVE }
            }

        override suspend fun insert(entity: Goal) {
            _goals.value = _goals.value + entity
        }

        override suspend fun update(entity: Goal) {
            _goals.value = _goals.value.map { if (it.id == entity.id) entity else it }
        }

        override suspend fun updateProgress(id: SyncId, currentAmount: Cents) {
            _goals.value = _goals.value.map { goal ->
                if (goal.id == id) goal.copy(
                    currentAmount = currentAmount,
                    updatedAt = Clock.System.now(),
                ) else goal
            }
        }

        override suspend fun delete(id: SyncId) {
            _goals.value = _goals.value.map {
                if (it.id == id) it.copy(deletedAt = Clock.System.now()) else it
            }
        }

        override suspend fun getUnsynced(householdId: SyncId): List<Goal> = emptyList()

        override suspend fun markSynced(ids: List<SyncId>) {}
    }

    // ═══════════════════════════════════════════════════════════════════
    // initial state is loading
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `initial state is loading`() = runTest {
        val vm = GoalsViewModel(
            goalRepository = TestGoalRepository(),
        )

        // Before any coroutines have been dispatched, state is loading.
        val state = vm.uiState.value
        assertTrue(state.isLoading, "Expected isLoading = true on initial state")
        assertFalse(state.isRefreshing, "Expected isRefreshing = false on initial state")
        assertTrue(state.goals.isEmpty(), "Expected empty goals list on initial state")
        assertEquals(0, state.activeCount)
        assertEquals(0, state.completedCount)
        assertNull(state.errorMessage)
    }

    // ═══════════════════════════════════════════════════════════════════
    // loads goals from repository
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `loads goals from repository`() = runTest {
        val goal = createGoal(
            id = "goal-1",
            name = "Emergency Fund",
            targetCents = 1_000_000L, // $10,000
            currentCents = 350_000L,  // $3,500
            icon = "🏦",
        )

        val vm = GoalsViewModel(
            goalRepository = TestGoalRepository(listOf(goal)),
        )

        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.isLoading, "Expected isLoading = false after data loads")
        assertEquals(1, state.goals.size, "Expected exactly one goal item")
        assertNull(state.errorMessage)

        val item = state.goals.first()
        assertEquals("Emergency Fund", item.name)
        assertEquals("🏦", item.icon)
        assertFalse(item.isCompleted)
    }

    // ═══════════════════════════════════════════════════════════════════
    // counts active and completed goals
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `counts active and completed goals`() = runTest {
        val goals = listOf(
            createGoal("goal-1", "Active Goal 1", 100_000L, 50_000L, GoalStatus.ACTIVE),
            createGoal("goal-2", "Active Goal 2", 200_000L, 10_000L, GoalStatus.ACTIVE),
            createGoal(
                "goal-3", "Completed Goal", 50_000L, 50_000L,
                GoalStatus.COMPLETED,
            ),
            createGoal("goal-4", "Paused Goal", 75_000L, 25_000L, GoalStatus.PAUSED),
        )

        val vm = GoalsViewModel(
            goalRepository = TestGoalRepository(goals),
        )

        advanceUntilIdle()

        val state = vm.uiState.value
        assertEquals(4, state.goals.size, "All non-deleted goals should be listed")
        assertEquals(2, state.activeCount, "Expected 2 ACTIVE goals")
        assertEquals(1, state.completedCount, "Expected 1 COMPLETED goal")
    }

    // ═══════════════════════════════════════════════════════════════════
    // calculates progress percentage
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `calculates progress percentage for partially funded goal`() = runTest {
        val goal = createGoal(
            id = "goal-progress",
            name = "Vacation Fund",
            targetCents = 200_000L, // $2,000
            currentCents = 100_000L, // $1,000 → 50%
        )

        val vm = GoalsViewModel(
            goalRepository = TestGoalRepository(listOf(goal)),
        )

        advanceUntilIdle()

        val item = vm.uiState.value.goals.first()
        assertEquals(
            0.5f,
            item.progressPercent,
            "Expected 50% progress for $1,000 of $2,000",
        )
        assertFalse(item.isCompleted)
    }

    @Test
    fun `calculates progress percentage for fully funded goal`() = runTest {
        val goal = createGoal(
            id = "goal-full",
            name = "Laptop Fund",
            targetCents = 150_000L, // $1,500
            currentCents = 150_000L, // $1,500 → 100%
        )

        val vm = GoalsViewModel(
            goalRepository = TestGoalRepository(listOf(goal)),
        )

        advanceUntilIdle()

        val item = vm.uiState.value.goals.first()
        assertEquals(
            1.0f,
            item.progressPercent,
            "Expected 100% progress when current == target",
        )
        assertTrue(item.isCompleted)
    }

    @Test
    fun `progress percentage clamps at 1_0 when over-funded`() = runTest {
        val goal = createGoal(
            id = "goal-over",
            name = "Over-funded Goal",
            targetCents = 50_000L,   // $500
            currentCents = 75_000L,  // $750 → clamped to 1.0
        )

        val vm = GoalsViewModel(
            goalRepository = TestGoalRepository(listOf(goal)),
        )

        advanceUntilIdle()

        val item = vm.uiState.value.goals.first()
        assertEquals(
            1.0f,
            item.progressPercent,
            "Expected progress clamped to 1.0 when over-funded",
        )
        assertTrue(item.isCompleted)
    }

    @Test
    fun `progress percentage is 0 for unfunded goal`() = runTest {
        val goal = createGoal(
            id = "goal-zero",
            name = "New Goal",
            targetCents = 100_000L,
            currentCents = 0L,
        )

        val vm = GoalsViewModel(
            goalRepository = TestGoalRepository(listOf(goal)),
        )

        advanceUntilIdle()

        val item = vm.uiState.value.goals.first()
        assertEquals(
            0.0f,
            item.progressPercent,
            "Expected 0% progress for unfunded goal",
        )
        assertFalse(item.isCompleted)
    }

    // ═══════════════════════════════════════════════════════════════════
    // formats currency correctly
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `formats currency correctly`() = runTest {
        val goal = createGoal(
            id = "goal-fmt",
            name = "Savings Goal",
            targetCents = 1_000_000L, // $10,000.00
            currentCents = 350_000L,  // $3,500.00
        )

        val vm = GoalsViewModel(
            goalRepository = TestGoalRepository(listOf(goal)),
        )

        advanceUntilIdle()

        val item = vm.uiState.value.goals.first()
        assertEquals(
            "$10,000.00",
            item.targetFormatted,
            "Target should be formatted as USD currency",
        )
        assertEquals(
            "$3,500.00",
            item.currentFormatted,
            "Current amount should be formatted as USD currency",
        )
        assertEquals(
            "$6,500.00",
            item.remainingFormatted,
            "Remaining should be target - current, formatted as USD",
        )
    }

    @Test
    fun `remaining amount is zero when fully funded`() = runTest {
        val goal = createGoal(
            id = "goal-rem-zero",
            name = "Complete Goal",
            targetCents = 50_000L,
            currentCents = 50_000L,
        )

        val vm = GoalsViewModel(
            goalRepository = TestGoalRepository(listOf(goal)),
        )

        advanceUntilIdle()

        val item = vm.uiState.value.goals.first()
        assertEquals(
            "$0.00",
            item.remainingFormatted,
            "Remaining should be $0.00 when fully funded",
        )
    }

    @Test
    fun `remaining amount is zero when over-funded`() = runTest {
        val goal = createGoal(
            id = "goal-rem-over",
            name = "Over-funded Goal",
            targetCents = 50_000L,
            currentCents = 80_000L,
        )

        val vm = GoalsViewModel(
            goalRepository = TestGoalRepository(listOf(goal)),
        )

        advanceUntilIdle()

        val item = vm.uiState.value.goals.first()
        assertEquals(
            "$0.00",
            item.remainingFormatted,
            "Remaining should be clamped to $0.00 when over-funded",
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // refresh updates state
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `refresh updates state`() = runTest {
        val goal = createGoal("goal-r", "Refresh Goal", 100_000L, 50_000L)

        val vm = GoalsViewModel(
            goalRepository = TestGoalRepository(listOf(goal)),
        )

        // Let initial load complete.
        advanceUntilIdle()
        assertFalse(vm.uiState.value.isLoading)
        assertFalse(vm.uiState.value.isRefreshing)

        // Trigger refresh.
        vm.refresh()

        // Shortly after starting refresh, isRefreshing should be true.
        testDispatcher.scheduler.advanceTimeBy(100)
        testDispatcher.scheduler.runCurrent()
        assertTrue(
            vm.uiState.value.isRefreshing,
            "Expected isRefreshing = true during refresh",
        )

        // Let refresh complete.
        advanceUntilIdle()
        assertFalse(
            vm.uiState.value.isRefreshing,
            "Expected isRefreshing = false after refresh completes",
        )
        assertEquals(1, vm.uiState.value.goals.size, "Goals should still be present after refresh")
    }

    // ═══════════════════════════════════════════════════════════════════
    // handles empty goals list
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `handles empty goals list`() = runTest {
        val vm = GoalsViewModel(
            goalRepository = TestGoalRepository(emptyList()),
        )

        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.isLoading)
        assertTrue(state.goals.isEmpty(), "Expected empty goals when repository has none")
        assertEquals(0, state.activeCount)
        assertEquals(0, state.completedCount)
        assertNull(state.errorMessage)
    }

    // ═══════════════════════════════════════════════════════════════════
    // target date formatting
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `formats target date correctly`() = runTest {
        val goal = createGoal(
            id = "goal-date",
            name = "Dated Goal",
            targetCents = 100_000L,
            targetDate = LocalDate(2025, 6, 15),
        )

        val vm = GoalsViewModel(
            goalRepository = TestGoalRepository(listOf(goal)),
        )

        advanceUntilIdle()

        val item = vm.uiState.value.goals.first()
        assertEquals(
            "Jun 15, 2025",
            item.targetDate,
            "Target date should be formatted as 'MMM dd, yyyy'",
        )
    }

    @Test
    fun `null target date produces null in UI`() = runTest {
        val goal = createGoal(
            id = "goal-no-date",
            name = "Open-ended Goal",
            targetCents = 100_000L,
            targetDate = null,
        )

        val vm = GoalsViewModel(
            goalRepository = TestGoalRepository(listOf(goal)),
        )

        advanceUntilIdle()

        val item = vm.uiState.value.goals.first()
        assertNull(item.targetDate, "Goals without a target date should have null targetDate in UI")
    }

    // ═══════════════════════════════════════════════════════════════════
    // formatDate companion function
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `formatDate companion produces correct format`() {
        assertEquals("Jan 1, 2024", GoalsViewModel.formatDate(LocalDate(2024, 1, 1)))
        assertEquals("Dec 25, 2023", GoalsViewModel.formatDate(LocalDate(2023, 12, 25)))
        assertEquals("Feb 29, 2024", GoalsViewModel.formatDate(LocalDate(2024, 2, 29)))
        assertEquals("Nov 5, 2025", GoalsViewModel.formatDate(LocalDate(2025, 11, 5)))
    }

    // ═══════════════════════════════════════════════════════════════════
    // create goal
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `createGoal inserts active goal with defaults`() = runTest {
        val repository = TestGoalRepository()
        val vm = GoalsViewModel(
            goalRepository = repository,
        )

        advanceUntilIdle()

        vm.createGoal(
            name = "Trip Fund",
            targetAmount = Cents(125_000L),
            targetDate = LocalDate(2026, 1, 15),
        )
        advanceUntilIdle()

        val createdId = vm.uiState.value.goals.single().id
        val createdGoal = repository.getById(createdId)
        assertNotNull(createdGoal)
        assertEquals(SyncId("household-1"), createdGoal.householdId)
        assertEquals(GoalStatus.ACTIVE, createdGoal.status)
        assertEquals(Currency.USD, createdGoal.currency)
        assertEquals(Cents(125_000L), createdGoal.targetAmount)
        assertEquals(LocalDate(2026, 1, 15), createdGoal.targetDate)
        assertEquals(1, vm.uiState.value.activeCount)
    }

    // ═══════════════════════════════════════════════════════════════════
    // multiple goals
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun `multiple goals are all mapped correctly`() = runTest {
        val goals = listOf(
            createGoal("g-1", "Emergency Fund", 1_000_000L, 250_000L, GoalStatus.ACTIVE),
            createGoal("g-2", "Vacation", 500_000L, 500_000L, GoalStatus.COMPLETED),
            createGoal("g-3", "New Car", 3_000_000L, 0L, GoalStatus.ACTIVE),
        )

        val vm = GoalsViewModel(
            goalRepository = TestGoalRepository(goals),
        )

        advanceUntilIdle()

        val state = vm.uiState.value
        assertEquals(3, state.goals.size)
        assertEquals(2, state.activeCount)
        assertEquals(1, state.completedCount)

        // Verify each goal's mapping
        val emergencyFund = state.goals.find { it.name == "Emergency Fund" }!!
        assertEquals("$10,000.00", emergencyFund.targetFormatted)
        assertEquals("$2,500.00", emergencyFund.currentFormatted)
        assertEquals(0.25f, emergencyFund.progressPercent)
        assertFalse(emergencyFund.isCompleted)

        val vacation = state.goals.find { it.name == "Vacation" }!!
        assertEquals(1.0f, vacation.progressPercent)
        assertTrue(vacation.isCompleted)
        assertEquals("$0.00", vacation.remainingFormatted)

        val newCar = state.goals.find { it.name == "New Car" }!!
        assertEquals("$30,000.00", newCar.targetFormatted)
        assertEquals("$0.00", newCar.currentFormatted)
        assertEquals(0.0f, newCar.progressPercent)
        assertFalse(newCar.isCompleted)
    }
}
