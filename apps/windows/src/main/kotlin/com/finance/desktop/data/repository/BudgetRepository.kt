// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.repository

import com.finance.models.Budget
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.Flow

interface BudgetRepository {
    fun observeAll(householdId: SyncId): Flow<List<Budget>>
    fun observeActive(householdId: SyncId): Flow<List<Budget>>
    suspend fun insert(entity: Budget)
    suspend fun delete(id: SyncId)
}
