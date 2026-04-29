// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.repository

import com.finance.models.Transaction
import com.finance.models.TransactionType
import kotlinx.coroutines.flow.Flow

/**
 * Repository interface for [Transaction] CRUD operations.
 */
interface TransactionRepository : BaseRepository<Transaction> {
    fun observeByHousehold(householdId: String): Flow<List<Transaction>>
    fun observeByAccount(accountId: String): Flow<List<Transaction>>
    suspend fun getByOwner(ownerId: String): List<Transaction>
    suspend fun getByCategory(categoryId: String): List<Transaction>
    suspend fun getByDateRange(householdId: String, startDate: String, endDate: String): List<Transaction>
    suspend fun getByAccountAndDateRange(accountId: String, startDate: String, endDate: String): List<Transaction>
    suspend fun getByType(householdId: String, type: TransactionType): List<Transaction>
    suspend fun sumByCategory(householdId: String, startDate: String, endDate: String, type: TransactionType): Map<String?, Long>
    suspend fun sumByAccount(householdId: String, startDate: String, endDate: String): Map<String, Long>
}
