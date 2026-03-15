// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository

import com.finance.models.Budget
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.Flow

/**
 * Repository contract for [Budget] entities.
 *
 * Extends [BaseRepository] with budget-specific queries such as
 * filtering by category or active status.
 */
interface BudgetRepository : BaseRepository<Budget> {

    /**
     * Observes all non-deleted budgets linked to a specific category.
     *
     * @param categoryId The category to filter by.
     */
    fun observeByCategory(categoryId: SyncId): Flow<List<Budget>>

    /**
     * Observes all non-deleted budgets that are currently active
     * (i.e. `endDate` is null or in the future).
     *
     * @param householdId The household to scope the query to.
     */
    fun observeActive(householdId: SyncId): Flow<List<Budget>>
}
