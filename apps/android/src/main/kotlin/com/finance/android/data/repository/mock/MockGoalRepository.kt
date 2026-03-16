// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.mock

import com.finance.android.data.repository.GoalRepository
import com.finance.models.Goal
import com.finance.models.GoalStatus
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.datetime.Clock

/**
 * In-memory [GoalRepository] seeded with [SampleData.goals].
 *
 * Supports basic CRUD by mutating an internal list and re-emitting the [Flow].
 * Intended for development, previews, and testing until a real database layer
 * (e.g. SQLDelight) is wired up.
 */
class MockGoalRepository : GoalRepository {

    private val _goals = MutableStateFlow<List<Goal>>(emptyList())

    override fun observeAll(householdId: SyncId): Flow<List<Goal>> =
        _goals.map { list ->
            list.filter { it.householdId == householdId && it.deletedAt == null }
        }

    override fun observeById(id: SyncId): Flow<Goal?> =
        _goals.map { list -> list.find { it.id == id && it.deletedAt == null } }

    override suspend fun getById(id: SyncId): Goal? =
        _goals.value.find { it.id == id && it.deletedAt == null }

    override fun observeActive(householdId: SyncId): Flow<List<Goal>> =
        _goals.map { list ->
            list.filter {
                it.householdId == householdId &&
                    it.deletedAt == null &&
                    it.status == GoalStatus.ACTIVE
            }
        }

    override suspend fun insert(goal: Goal) {
        _goals.update { it + goal }
    }

    override suspend fun update(goal: Goal) {
        _goals.update { list ->
            list.map { if (it.id == goal.id) goal else it }
        }
    }

    override suspend fun updateProgress(id: SyncId, currentAmount: Cents) {
        val now = Clock.System.now()
        _goals.update { list ->
            list.map { goal ->
                if (goal.id == id) goal.copy(
                    currentAmount = currentAmount,
                    updatedAt = now,
                    isSynced = false,
                ) else goal
            }
        }
    }

    override suspend fun delete(id: SyncId) {
        val now = Clock.System.now()
        _goals.update { list ->
            list.map { goal ->
                if (goal.id == id) goal.copy(
                    deletedAt = now,
                    updatedAt = now,
                    isSynced = false,
                ) else goal
            }
        }
    }

    override suspend fun getUnsynced(householdId: SyncId): List<Goal> =
        _goals.value.filter { it.householdId == householdId && !it.isSynced }

    override suspend fun markSynced(ids: List<SyncId>) {
        _goals.update { list ->
            list.map { goal ->
                if (goal.id in ids) goal.copy(isSynced = true) else goal
            }
        }
    }
}
