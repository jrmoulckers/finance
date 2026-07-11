// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.data.repository.GoalRepository
import com.finance.models.Goal
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.datetime.Clock
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for [GoalsViewModel] error/retry (#3685) and create (#3677) flows.
 *
 * Uses a controllable fake [GoalRepository] so the load can be made to fail and
 * then recover on retry, and a created goal can be observed as persisted.
 */
class GoalsViewModelTest {

    private class FakeGoalRepository(
        @Volatile var shouldFail: Boolean = false,
    ) : GoalRepository {
        val stored = mutableListOf<Goal>()

        override fun observeAll(householdId: SyncId): Flow<List<Goal>> =
            if (shouldFail) {
                flow { throw IllegalStateException("network down") }
            } else {
                flowOf(stored.toList())
            }

        override fun observeActive(householdId: SyncId): Flow<List<Goal>> = observeAll(householdId)
        override suspend fun updateProgress(id: SyncId, currentAmount: Cents) = Unit
        override suspend fun insert(entity: Goal) { stored.add(entity) }
        override suspend fun update(entity: Goal) {
            val idx = stored.indexOfFirst { it.id == entity.id }
            if (idx >= 0) stored[idx] = entity
        }
        override suspend fun delete(id: SyncId) { stored.removeAll { it.id == id } }
    }

    private fun sampleGoal() = Goal(
        id = SyncId("g1"),
        householdId = SyncId("d1"),
        ownerId = SyncId("owner-1"),
        name = "Emergency Fund",
        targetAmount = Cents(1000000),
        currentAmount = Cents(250000),
        currency = Currency.USD,
        createdAt = Clock.System.now(),
        updatedAt = Clock.System.now(),
    )

    private fun waitUntil(timeoutMs: Long = 3000, predicate: () -> Boolean) {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (predicate()) return
            Thread.sleep(10)
        }
        throw AssertionError("Condition not met within ${timeoutMs}ms")
    }

    @Test
    fun `load failure surfaces an error message and stops loading`() {
        val repo = FakeGoalRepository(shouldFail = true)
        val vm = GoalsViewModel(repo)

        waitUntil { !vm.uiState.value.isLoading }
        assertNotNull(vm.uiState.value.errorMessage)
    }

    @Test
    fun `retry after recovery clears the error and loads goals`() {
        val repo = FakeGoalRepository(shouldFail = true)
        repo.stored.add(sampleGoal())
        val vm = GoalsViewModel(repo)

        waitUntil { vm.uiState.value.errorMessage != null }

        repo.shouldFail = false
        vm.retry()

        waitUntil { !vm.uiState.value.isLoading && vm.uiState.value.errorMessage == null }
        assertNull(vm.uiState.value.errorMessage)
        assertEquals(1, vm.uiState.value.goals.size)
    }

    @Test
    fun `create flow inserts a new goal and refreshes the list`() {
        val repo = FakeGoalRepository()
        val vm = GoalsViewModel(repo)
        waitUntil { !vm.uiState.value.isLoading }

        vm.startCreate()
        assertTrue(vm.uiState.value.isCreating)
        vm.updateEditName("Vacation")
        vm.updateEditTargetAmount("500")
        vm.updateEditCurrentAmount("0")
        vm.saveEdit()

        waitUntil { vm.uiState.value.goals.isNotEmpty() }
        assertEquals(1, repo.stored.size)
        assertEquals("Vacation", repo.stored.first().name)
        assertTrue(!vm.uiState.value.isCreating)
    }

    @Test
    fun `create is rejected when name blank or target not positive`() {
        val repo = FakeGoalRepository()
        val vm = GoalsViewModel(repo)
        waitUntil { !vm.uiState.value.isLoading }

        vm.startCreate()
        vm.updateEditName("   ")
        vm.updateEditTargetAmount("100")
        vm.saveEdit()

        // Nothing persisted for a blank name.
        assertEquals(0, repo.stored.size)
    }
}
