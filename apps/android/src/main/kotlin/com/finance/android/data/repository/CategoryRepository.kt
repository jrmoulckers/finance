// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository

import com.finance.models.Category
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.Flow

/**
 * Repository contract for [Category] entities.
 *
 * Extends [BaseRepository] with category-specific queries such as
 * filtering by parent, income, or expense categories.
 */
interface CategoryRepository : BaseRepository<Category> {

    /**
     * Observes non-deleted categories whose parent matches the given ID.
     *
     * Pass `null` to retrieve root-level categories.
     *
     * @param parentId The parent category ID, or `null` for roots.
     */
    fun observeByParent(parentId: SyncId?): Flow<List<Category>>

    /**
     * Observes non-deleted income categories for a household
     * (where [Category.isIncome] is `true`).
     *
     * @param householdId The household to scope the query to.
     */
    fun observeIncome(householdId: SyncId): Flow<List<Category>>

    /**
     * Observes non-deleted expense categories for a household
     * (where [Category.isIncome] is `false`).
     *
     * @param householdId The household to scope the query to.
     */
    fun observeExpense(householdId: SyncId): Flow<List<Category>>
}
