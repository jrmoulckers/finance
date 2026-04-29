// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.repository

import com.finance.models.Goal
import com.finance.models.GoalStatus
import com.finance.models.types.Cents
import kotlinx.coroutines.flow.Flow

/**
 * Repository interface for [Goal] CRUD operations.
 */
interface GoalRepository : BaseRepository<Goal> {
    fun observeByHousehold(householdId: String): Flow<List<Goal>>
    fun observeActive(householdId: String): Flow<List<Goal>>
    suspend fun getByOwner(ownerId: String): List<Goal>
    suspend fun getByStatus(householdId: String, status: GoalStatus): List<Goal>
    suspend fun getByAccount(accountId: String): List<Goal>
    suspend fun updateProgress(id: String, currentAmount: Cents)
    suspend fun updateStatus(id: String, status: GoalStatus)
}
