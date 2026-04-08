// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.repository

import com.finance.models.Account
import com.finance.models.types.*
import kotlinx.coroutines.flow.Flow

interface AccountRepository {
    fun observeAll(householdId: SyncId): Flow<List<Account>>
    fun observeById(id: SyncId): Flow<Account?>
    suspend fun getById(id: SyncId): Account?
    suspend fun insert(entity: Account)
    suspend fun update(entity: Account)
    suspend fun delete(id: SyncId)
    fun observeActive(householdId: SyncId): Flow<List<Account>>
    suspend fun updateBalance(id: SyncId, newBalance: Cents)
}
