// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.impl

import com.finance.android.data.repository.TransactionRepository
import com.finance.android.ui.data.SampleData
import com.finance.models.Transaction
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate

// TODO(#432): Replace with SQLDelight-backed implementation

/**
 * In-memory stub implementation of [TransactionRepository].
 *
 * Uses a [MutableStateFlow] as its backing store so that all
 * `observe*` methods emit updates reactively. This implementation
 * is intended **only** for development and testing until the real
 * SQLDelight-backed repository is available (see issue #432).
 */
class InMemoryTransactionRepository : TransactionRepository {

    private val store = MutableStateFlow(SampleData.transactions.toList())

    /** All non-deleted records. */
    private fun List<Transaction>.active(): List<Transaction> =
        filter { it.deletedAt == null }

    // ── BaseRepository ──────────────────────────────────────────────

    override fun observeAll(householdId: SyncId): Flow<List<Transaction>> =
        store.map { list ->
            list.active()
                .filter { it.householdId == householdId }
                .sortedByDescending { it.date }
        }

    override fun observeById(id: SyncId): Flow<Transaction?> =
        store.map { list ->
            list.active().find { it.id == id }
        }

    override suspend fun getById(id: SyncId): Transaction? =
        store.value.active().find { it.id == id }

    override suspend fun insert(entity: Transaction) {
        store.update { current -> current + entity }
    }

    override suspend fun update(entity: Transaction) {
        store.update { current ->
            current.map { if (it.id == entity.id) entity else it }
        }
    }

    override suspend fun delete(id: SyncId) {
        val now = Clock.System.now()
        store.update { current ->
            current.map { txn ->
                if (txn.id == id && txn.deletedAt == null) {
                    txn.copy(deletedAt = now, isSynced = false, updatedAt = now)
                } else {
                    txn
                }
            }
        }
    }

    override suspend fun getUnsynced(householdId: SyncId): List<Transaction> =
        store.value.filter { it.householdId == householdId && !it.isSynced }

    override suspend fun markSynced(ids: List<SyncId>) {
        val idSet = ids.toSet()
        store.update { current ->
            current.map { txn ->
                if (txn.id in idSet) txn.copy(isSynced = true) else txn
            }
        }
    }

    // ── TransactionRepository ───────────────────────────────────────

    override fun observeByAccount(accountId: SyncId): Flow<List<Transaction>> =
        store.map { list ->
            list.active()
                .filter { it.accountId == accountId }
                .sortedByDescending { it.date }
        }

    override fun observeByCategory(categoryId: SyncId): Flow<List<Transaction>> =
        store.map { list ->
            list.active()
                .filter { it.categoryId == categoryId }
                .sortedByDescending { it.date }
        }

    override fun observeByDateRange(
        householdId: SyncId,
        start: LocalDate,
        end: LocalDate,
    ): Flow<List<Transaction>> =
        store.map { list ->
            list.active()
                .filter { it.householdId == householdId && it.date in start..end }
                .sortedByDescending { it.date }
        }

    override suspend fun getByDateRange(
        householdId: SyncId,
        start: LocalDate,
        end: LocalDate,
    ): List<Transaction> =
        store.value.active()
            .filter { it.householdId == householdId && it.date in start..end }
            .sortedByDescending { it.date }
}
