// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.repository

import com.finance.models.Account
import com.finance.models.AccountType
import com.finance.models.types.Cents
import kotlinx.coroutines.flow.Flow

/**
 * Repository interface for [Account] CRUD operations.
 */
interface AccountRepository : BaseRepository<Account> {
    fun observeByHousehold(householdId: String): Flow<List<Account>>
    fun observeActive(householdId: String): Flow<List<Account>>
    suspend fun getByOwner(ownerId: String): List<Account>
    suspend fun getByHouseholdAndType(householdId: String, type: AccountType): List<Account>
    suspend fun updateBalance(id: String, newBalance: Cents)
    suspend fun archive(id: String)
}
