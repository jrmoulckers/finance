// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository

import com.finance.models.Transaction
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.Flow
import kotlinx.datetime.LocalDate

/**
 * Repository contract for [Transaction] entities.
 *
 * Extends [BaseRepository] with transaction-specific queries such as
 * filtering by account, category, or date range.
 */
interface TransactionRepository : BaseRepository<Transaction> {

    /**
     * Observes all non-deleted transactions for a given account,
     * ordered by date descending.
     *
     * @param accountId The account to filter by.
     */
    fun observeByAccount(accountId: SyncId): Flow<List<Transaction>>

    /**
     * Observes all non-deleted transactions for a given category,
     * ordered by date descending.
     *
     * @param categoryId The category to filter by.
     */
    fun observeByCategory(categoryId: SyncId): Flow<List<Transaction>>

    /**
     * Observes non-deleted transactions within a date range (inclusive),
     * ordered by date descending.
     *
     * @param householdId The household to scope the query to.
     * @param start The start date (inclusive).
     * @param end The end date (inclusive).
     */
    fun observeByDateRange(
        householdId: SyncId,
        start: LocalDate,
        end: LocalDate,
    ): Flow<List<Transaction>>

    /**
     * Fetches non-deleted transactions within a date range (inclusive).
     *
     * @param householdId The household to scope the query to.
     * @param start The start date (inclusive).
     * @param end The end date (inclusive).
     */
    suspend fun getByDateRange(
        householdId: SyncId,
        start: LocalDate,
        end: LocalDate,
    ): List<Transaction>
}
