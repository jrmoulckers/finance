// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.impl

import com.finance.android.data.repository.BudgetRepository
import com.finance.models.Budget
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

// TODO(#432): Replace with SQLDelight-backed implementation

/**
 * In-memory stub implementation of [BudgetRepository].
 *
 * Uses a [MutableStateFlow] as its backing store so that all
 * `observe*` methods emit updates reactively. This implementation
 * is intended **only** for development and testing until the real
 * SQLDelight-backed repository is available (see issue #432).
 */
class InMemoryBudgetRepository : BudgetRepository {

    private val store = MutableStateFlow<List<Budget>>(emptyList())

    /** All non-deleted records. */
    private fun List<Budget>.active(): List<Budget> =
        filter { it.deletedAt == null }

    // ── BaseRepository ──────────────────────────────────────────────

    override fun observeAll(householdId: SyncId): Flow<List<Budget>> =
        store.map { list ->
            list.active()
                .filter { it.householdId == householdId }
        }

    override fun observeById(id: SyncId): Flow<Budget?> =
        store.map { list ->
            list.active().find { it.id == id }
        }

    override suspend fun getById(id: SyncId): Budget? =
        store.value.active().find { it.id == id }

    override suspend fun insert(entity: Budget) {
        store.update { current -> current + entity }
    }

    override suspend fun update(entity: Budget) {
        store.update { current ->
            current.map { if (it.id == entity.id) entity else it }
        }
    }

    override suspend fun delete(id: SyncId) {
        val now = Clock.System.now()
        store.update { current ->
            current.map { budget ->
                if (budget.id == id && budget.deletedAt == null) {
                    budget.copy(deletedAt = now, isSynced = false, updatedAt = now)
                } else {
                    budget
                }
            }
        }
    }

    override suspend fun getUnsynced(householdId: SyncId): List<Budget> =
        store.value.filter { it.householdId == householdId && !it.isSynced }

    override suspend fun markSynced(ids: List<SyncId>) {
        val idSet = ids.toSet()
        store.update { current ->
            current.map { budget ->
                if (budget.id in idSet) budget.copy(isSynced = true) else budget
            }
        }
    }

    // ── BudgetRepository ────────────────────────────────────────────

    override fun observeByCategory(categoryId: SyncId): Flow<List<Budget>> =
        store.map { list ->
            list.active()
                .filter { it.categoryId == categoryId }
        }

    override fun observeActive(householdId: SyncId): Flow<List<Budget>> =
        store.map { list ->
            val today = Clock.System.now()
                .toLocalDateTime(TimeZone.currentSystemDefault()).date
            list.active()
                .filter { budget ->
                    val endDate = budget.endDate
                    budget.householdId == householdId &&
                        (endDate == null || endDate >= today)
                }
        }
}
