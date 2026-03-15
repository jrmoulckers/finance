// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.impl

import com.finance.android.data.repository.CategoryRepository
import com.finance.models.Category
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.datetime.Clock

// TODO(#432): Replace with SQLDelight-backed implementation

/**
 * In-memory stub implementation of [CategoryRepository].
 *
 * Uses a [MutableStateFlow] as its backing store so that all
 * `observe*` methods emit updates reactively. This implementation
 * is intended **only** for development and testing until the real
 * SQLDelight-backed repository is available (see issue #432).
 */
class InMemoryCategoryRepository : CategoryRepository {

    private val store = MutableStateFlow<List<Category>>(emptyList())

    /** All non-deleted records. */
    private fun List<Category>.active(): List<Category> =
        filter { it.deletedAt == null }

    // ── BaseRepository ──────────────────────────────────────────────

    override fun observeAll(householdId: SyncId): Flow<List<Category>> =
        store.map { list ->
            list.active()
                .filter { it.householdId == householdId }
                .sortedBy { it.sortOrder }
        }

    override fun observeById(id: SyncId): Flow<Category?> =
        store.map { list ->
            list.active().find { it.id == id }
        }

    override suspend fun getById(id: SyncId): Category? =
        store.value.active().find { it.id == id }

    override suspend fun insert(entity: Category) {
        store.update { current -> current + entity }
    }

    override suspend fun update(entity: Category) {
        store.update { current ->
            current.map { if (it.id == entity.id) entity else it }
        }
    }

    override suspend fun delete(id: SyncId) {
        val now = Clock.System.now()
        store.update { current ->
            current.map { category ->
                if (category.id == id && category.deletedAt == null) {
                    category.copy(deletedAt = now, isSynced = false, updatedAt = now)
                } else {
                    category
                }
            }
        }
    }

    override suspend fun getUnsynced(householdId: SyncId): List<Category> =
        store.value.filter { it.householdId == householdId && !it.isSynced }

    override suspend fun markSynced(ids: List<SyncId>) {
        val idSet = ids.toSet()
        store.update { current ->
            current.map { category ->
                if (category.id in idSet) category.copy(isSynced = true) else category
            }
        }
    }

    // ── CategoryRepository ──────────────────────────────────────────

    override fun observeByParent(parentId: SyncId?): Flow<List<Category>> =
        store.map { list ->
            list.active()
                .filter { it.parentId == parentId }
                .sortedBy { it.sortOrder }
        }

    override fun observeIncome(householdId: SyncId): Flow<List<Category>> =
        store.map { list ->
            list.active()
                .filter { it.householdId == householdId && it.isIncome }
                .sortedBy { it.sortOrder }
        }

    override fun observeExpense(householdId: SyncId): Flow<List<Category>> =
        store.map { list ->
            list.active()
                .filter { it.householdId == householdId && !it.isIncome }
                .sortedBy { it.sortOrder }
        }
}
