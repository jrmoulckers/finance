// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.mock

import com.finance.android.data.repository.GoalRepository
import com.finance.android.ui.data.SampleData
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

    private val _goals = MutableStateFlow(SampleData.goals)

    override fun getAll(): Flow<List<Goal>> =
        _goals.map { list -> list.filter { it.deletedAt == null } }

    override fun getById(id: SyncId): Flow<Goal?> =
        _goals.map { list -> list.find { it.id == id && it.deletedAt == null } }

    override fun getActiveGoals(): Flow<List<Goal>> =
        _goals.map { list ->
            list.filter { it.deletedAt == null && it.status == GoalStatus.ACTIVE }
        }

    override suspend fun create(goal: Goal) {
        _goals.update { it + goal }
    }

    override suspend fun update(goal: Goal) {
        _goals.update { list ->
            list.map { if (it.id == goal.id) goal else it }
        }
    }

    override suspend fun updateProgress(id: SyncId, currentAmount: Cents) {
        _goals.update { list ->
            list.map { goal ->
                if (goal.id == id) goal.copy(
                    currentAmount = currentAmount,
                    updatedAt = Clock.System.now(),
                ) else goal
            }
        }
    }

    override suspend fun delete(id: SyncId) {
        _goals.update { list ->
            list.map { if (it.id == id) it.copy(deletedAt = Clock.System.now()) else it }
        }
    }
}
