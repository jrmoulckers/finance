// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.impl

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

// TODO(#432): Replace with SQLDelight-backed implementation

/**
 * In-memory stub implementation of [GoalRepository].
 *
 * Uses a [MutableStateFlow] as its backing store so that all
 * `observe*` methods emit updates reactively. This implementation
 * is intended **only** for development and testing until the real
 * SQLDelight-backed repository is available (see issue #432).
 */
class InMemoryGoalRepository : GoalRepository {

    private val store = MutableStateFlow(SampleData.goals.toList())

    /** All non-deleted records. */
    private fun List<Goal>.active(): List<Goal> =
        filter { it.deletedAt == null }

    // ── BaseRepository ──────────────────────────────────────────────

    override fun observeAll(householdId: SyncId): Flow<List<Goal>> =
        store.map { list ->
            list.active()
                .filter { it.householdId == householdId }
        }

    override fun observeById(id: SyncId): Flow<Goal?> =
        store.map { list ->
            list.active().find { it.id == id }
        }

    override suspend fun getById(id: SyncId): Goal? =
        store.value.active().find { it.id == id }

    override suspend fun insert(entity: Goal) {
        store.update { current -> current + entity }
    }

    override suspend fun update(entity: Goal) {
        store.update { current ->
            current.map { if (it.id == entity.id) entity else it }
        }
    }

    override suspend fun delete(id: SyncId) {
        val now = Clock.System.now()
        store.update { current ->
            current.map { goal ->
                if (goal.id == id && goal.deletedAt == null) {
                    goal.copy(deletedAt = now, isSynced = false, updatedAt = now)
                } else {
                    goal
                }
            }
        }
    }

    override suspend fun getUnsynced(householdId: SyncId): List<Goal> =
        store.value.filter { it.householdId == householdId && !it.isSynced }

    override suspend fun markSynced(ids: List<SyncId>) {
        val idSet = ids.toSet()
        store.update { current ->
            current.map { goal ->
                if (goal.id in idSet) goal.copy(isSynced = true) else goal
            }
        }
    }

    // ── GoalRepository ──────────────────────────────────────────────

    override fun observeActive(householdId: SyncId): Flow<List<Goal>> =
        store.map { list ->
            list.active()
                .filter { it.householdId == householdId && it.status == GoalStatus.ACTIVE }
        }

    override suspend fun updateProgress(id: SyncId, currentAmount: Cents) {
        val now = Clock.System.now()
        store.update { current ->
            current.map { goal ->
                if (goal.id == id) {
                    goal.copy(
                        currentAmount = currentAmount,
                        isSynced = false,
                        updatedAt = now,
                    )
                } else {
                    goal
                }
            }
        }
    }
}
