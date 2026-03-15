// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.mock

import com.finance.android.data.repository.CategoryRepository
import com.finance.android.ui.data.SampleData
import com.finance.models.Category
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.datetime.Clock

/**
 * In-memory [CategoryRepository] backed by [SampleData].
 *
 * Supports basic CRUD by mutating an internal list and re-emitting the [Flow].
 * Intended for development, previews, and testing until a real database layer
 * (e.g. SQLDelight) is wired up.
 */
class MockCategoryRepository : CategoryRepository {

    private val _categories = MutableStateFlow(SampleData.categories.toList())

    override fun getAll(): Flow<List<Category>> =
        _categories.map { list ->
            list.filter { it.deletedAt == null }.sortedBy { it.sortOrder }
        }

    override fun getById(id: SyncId): Flow<Category?> =
        _categories.map { list -> list.find { it.id == id && it.deletedAt == null } }

    override fun getIncomeCategories(): Flow<List<Category>> =
        _categories.map { list ->
            list.filter { it.isIncome && it.deletedAt == null }.sortedBy { it.sortOrder }
        }

    override fun getExpenseCategories(): Flow<List<Category>> =
        _categories.map { list ->
            list.filter { !it.isIncome && it.deletedAt == null }.sortedBy { it.sortOrder }
        }

    override suspend fun create(category: Category) {
        _categories.update { it + category }
    }

    override suspend fun update(category: Category) {
        _categories.update { list ->
            list.map { if (it.id == category.id) category else it }
        }
    }

    override suspend fun delete(id: SyncId) {
        _categories.update { list ->
            list.map { if (it.id == id) it.copy(deletedAt = Clock.System.now()) else it }
        }
    }
}
