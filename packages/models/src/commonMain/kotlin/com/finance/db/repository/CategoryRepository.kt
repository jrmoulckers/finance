// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.repository

import com.finance.models.Category
import kotlinx.coroutines.flow.Flow

/**
 * Repository interface for [Category] CRUD operations.
 */
interface CategoryRepository : BaseRepository<Category> {
    fun observeByHousehold(householdId: String): Flow<List<Category>>
    suspend fun getByOwner(ownerId: String): List<Category>
    suspend fun getTopLevel(householdId: String): List<Category>
    suspend fun getSubcategories(parentId: String): List<Category>
    suspend fun getIncomeCategories(householdId: String): List<Category>
    suspend fun getExpenseCategories(householdId: String): List<Category>
}
