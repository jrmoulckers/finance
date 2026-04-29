// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.repository

import com.finance.models.Budget
import com.finance.models.BudgetPeriod
import kotlinx.coroutines.flow.Flow

/**
 * Repository interface for [Budget] CRUD operations.
 */
interface BudgetRepository : BaseRepository<Budget> {
    fun observeByHousehold(householdId: String): Flow<List<Budget>>
    suspend fun getByOwner(ownerId: String): List<Budget>
    suspend fun getByCategory(categoryId: String): List<Budget>
    suspend fun getByPeriod(householdId: String, period: BudgetPeriod): List<Budget>
    suspend fun getActive(householdId: String, today: String): List<Budget>
}
