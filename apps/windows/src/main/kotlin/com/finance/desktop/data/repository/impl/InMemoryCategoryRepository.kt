// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.repository.impl

import com.finance.desktop.data.repository.CategoryRepository
import com.finance.models.Category
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.*

class InMemoryCategoryRepository : CategoryRepository {
    private val store = MutableStateFlow<List<Category>>(emptyList())
    override fun observeAll(householdId: SyncId) = store.map { it.filter { c -> c.deletedAt == null } }
    override suspend fun getById(id: SyncId) = store.value.find { it.id == id }
}
