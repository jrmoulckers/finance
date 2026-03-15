// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository

import com.finance.models.Budget
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.Flow

/**
 * Repository for [Budget] entities.
 *
 * Provides reactive read streams via [Flow] and suspend write operations.
 */
interface BudgetRepository {

    /** Observe all non-deleted budgets. */
    fun getAll(): Flow<List<Budget>>

    /** Observe a single budget by its [SyncId], or `null` if not found. */
    fun getById(id: SyncId): Flow<Budget?>

    /**
     * Observe currently active budgets (those without an [Budget.endDate]
     * or whose end date has not yet passed).
     */
    fun getActiveBudgets(): Flow<List<Budget>>

    /** Observe budgets linked to a specific category. */
    fun getByCategoryId(categoryId: SyncId): Flow<List<Budget>>

    /** Insert a new budget. */
    suspend fun create(budget: Budget)

    /** Update an existing budget. */
    suspend fun update(budget: Budget)

    /** Soft-delete a budget by its [SyncId]. */
    suspend fun delete(id: SyncId)
}
