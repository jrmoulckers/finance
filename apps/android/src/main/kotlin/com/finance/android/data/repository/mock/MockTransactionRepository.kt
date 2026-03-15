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

    override fun getAll(): Flow<List<Transaction>> =
        _transactions.map { list ->
            list.filter { it.deletedAt == null }.sortedByDescending { it.date }
        }

    override fun getById(id: SyncId): Flow<Transaction?> =
        _transactions.map { list -> list.find { it.id == id && it.deletedAt == null } }

    override fun getByAccountId(accountId: SyncId): Flow<List<Transaction>> =
        _transactions.map { list ->
            list.filter { it.accountId == accountId && it.deletedAt == null }
                .sortedByDescending { it.date }
        }

    override fun getByCategoryId(categoryId: SyncId): Flow<List<Transaction>> =
        _transactions.map { list ->
            list.filter { it.categoryId == categoryId && it.deletedAt == null }
                .sortedByDescending { it.date }
        }

    override fun getByDateRange(from: LocalDate, to: LocalDate): Flow<List<Transaction>> =
        _transactions.map { list ->
            list.filter { it.deletedAt == null && it.date in from..to }
                .sortedByDescending { it.date }
        }

    override fun search(query: String): Flow<List<Transaction>> =
        _transactions.map { list ->
            val q = query.lowercase()
            list.filter { txn ->
                txn.deletedAt == null && (
                    txn.payee?.lowercase()?.contains(q) == true ||
                    txn.note?.lowercase()?.contains(q) == true
                )
            }.sortedByDescending { it.date }
        }

    override fun getPayeeHistory(): Flow<List<String>> =
        _transactions.map { list ->
            list.filter { it.deletedAt == null }
                .mapNotNull { it.payee }
                .distinct()
                .sorted()
        }

    override suspend fun create(transaction: Transaction) {
        _transactions.update { it + transaction }
    }

    override suspend fun update(transaction: Transaction) {
        _transactions.update { list ->
            list.map { if (it.id == transaction.id) transaction else it }
        }
    }

    override suspend fun delete(id: SyncId) {
        _transactions.update { list ->
            list.map { if (it.id == id) it.copy(deletedAt = Clock.System.now()) else it }
        }
    }
}
