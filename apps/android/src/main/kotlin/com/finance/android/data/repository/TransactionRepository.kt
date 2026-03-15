// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository

import com.finance.models.Transaction
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.Flow
import kotlinx.datetime.LocalDate

/**
 * Repository for [Transaction] entities.
 *
 * Provides reactive read streams via [Flow] and suspend write operations.
 * Filtering, search, and pagination are supported for the Transactions screen.
 */
interface TransactionRepository {

    /** Observe all non-deleted transactions, newest first. */
    fun getAll(): Flow<List<Transaction>>

    /** Observe a single transaction by its [SyncId], or `null` if not found. */
    fun getById(id: SyncId): Flow<Transaction?>

    /** Observe transactions belonging to a specific account. */
    fun getByAccountId(accountId: SyncId): Flow<List<Transaction>>

    /** Observe transactions in a specific category. */
    fun getByCategoryId(categoryId: SyncId): Flow<List<Transaction>>

    /** Observe transactions whose [Transaction.date] falls within [from]..[to]. */
    fun getByDateRange(from: LocalDate, to: LocalDate): Flow<List<Transaction>>

    /**
     * Search transactions by payee or note content.
     *
     * @param query Case-insensitive search term.
     */
    fun search(query: String): Flow<List<Transaction>>

    /** Observe distinct payee names for autocomplete suggestions. */
    fun getPayeeHistory(): Flow<List<String>>

    /** Insert a new transaction. */
    suspend fun create(transaction: Transaction)

    /** Update an existing transaction. */
    suspend fun update(transaction: Transaction)

    /** Soft-delete a transaction by its [SyncId]. */
    suspend fun delete(id: SyncId)
}
