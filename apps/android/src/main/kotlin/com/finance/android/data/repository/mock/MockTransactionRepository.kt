// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.mock

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

/**
 * In-memory [TransactionRepository] backed by [SampleData].
 *
 * Supports basic CRUD by mutating an internal list and re-emitting the [Flow].
 * Intended for development, previews, and testing until a real database layer
 * (e.g. SQLDelight) is wired up.
 */
class MockTransactionRepository : TransactionRepository {

    private val _transactions = MutableStateFlow(SampleData.transactions.toList())

    override fun observeAll(householdId: SyncId): Flow<List<Transaction>> =
        _transactions.map { list ->
            list.filter { it.householdId == householdId && it.deletedAt == null }
                .sortedByDescending { it.date }
        }

    override fun observeById(id: SyncId): Flow<Transaction?> =
        _transactions.map { list -> list.find { it.id == id && it.deletedAt == null } }

    override suspend fun getById(id: SyncId): Transaction? =
        _transactions.value.find { it.id == id && it.deletedAt == null }

    override fun observeByAccount(accountId: SyncId): Flow<List<Transaction>> =
        _transactions.map { list ->
            list.filter { it.accountId == accountId && it.deletedAt == null }
                .sortedByDescending { it.date }
        }

    override fun observeByCategory(categoryId: SyncId): Flow<List<Transaction>> =
        _transactions.map { list ->
            list.filter { it.categoryId == categoryId && it.deletedAt == null }
                .sortedByDescending { it.date }
        }

    override fun observeByDateRange(
        householdId: SyncId,
        start: LocalDate,
        end: LocalDate,
    ): Flow<List<Transaction>> =
        _transactions.map { list ->
            list.filter {
                it.householdId == householdId &&
                    it.deletedAt == null &&
                    it.date in start..end
            }.sortedByDescending { it.date }
        }

    override suspend fun getByDateRange(
        householdId: SyncId,
        start: LocalDate,
        end: LocalDate,
    ): List<Transaction> =
        _transactions.value.filter {
            it.householdId == householdId &&
                it.deletedAt == null &&
                it.date in start..end
        }.sortedByDescending { it.date }

    override suspend fun insert(transaction: Transaction) {
        _transactions.update { it + transaction }
    }

    override suspend fun update(transaction: Transaction) {
        _transactions.update { list ->
            list.map { if (it.id == transaction.id) transaction else it }
        }
    }

    override suspend fun delete(id: SyncId) {
        val now = Clock.System.now()
        _transactions.update { list ->
            list.map { transaction ->
                if (transaction.id == id) transaction.copy(
                    deletedAt = now,
                    updatedAt = now,
                    isSynced = false,
                ) else transaction
            }
        }
    }

    override suspend fun getUnsynced(householdId: SyncId): List<Transaction> =
        _transactions.value.filter { it.householdId == householdId && !it.isSynced }

    override suspend fun markSynced(ids: List<SyncId>) {
        _transactions.update { list ->
            list.map { transaction ->
                if (transaction.id in ids) transaction.copy(isSynced = true) else transaction
            }
        }
    }
}
