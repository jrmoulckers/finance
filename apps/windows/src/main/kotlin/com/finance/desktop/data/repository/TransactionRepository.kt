// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.repository

import com.finance.models.Transaction
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.Flow
import kotlinx.datetime.LocalDate

interface TransactionRepository {
    fun observeAll(householdId: SyncId): Flow<List<Transaction>>
    fun observeById(id: SyncId): Flow<Transaction?>
    fun observeByAccount(accountId: SyncId): Flow<List<Transaction>>
    fun observeByDateRange(householdId: SyncId, start: LocalDate, end: LocalDate): Flow<List<Transaction>>
    suspend fun insert(entity: Transaction)
    suspend fun delete(id: SyncId)
}
