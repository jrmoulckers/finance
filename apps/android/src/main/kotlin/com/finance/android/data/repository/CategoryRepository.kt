// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository

import com.finance.models.Category
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.Flow

/**
 * Repository for [Category] entities.
 *
 * Provides reactive read streams via [Flow] and suspend write operations.
 * Categories are split into income and expense types for budgeting and
 * transaction creation flows.
 */
interface CategoryRepository {

    /** Observe all non-deleted categories, ordered by [Category.sortOrder]. */
    fun getAll(): Flow<List<Category>>

    /** Observe a single category by its [SyncId], or `null` if not found. */
    fun getById(id: SyncId): Flow<Category?>

    /** Observe categories where [Category.isIncome] is `true`. */
    fun getIncomeCategories(): Flow<List<Category>>

    /** Observe categories where [Category.isIncome] is `false`. */
    fun getExpenseCategories(): Flow<List<Category>>

    /** Insert a new category. */
    suspend fun create(category: Category)

    /** Update an existing category. */
    suspend fun update(category: Category)

    /** Soft-delete a category by its [SyncId]. */
    suspend fun delete(id: SyncId)
}
