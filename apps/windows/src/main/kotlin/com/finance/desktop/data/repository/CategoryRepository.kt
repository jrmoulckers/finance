// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.repository

import com.finance.models.Category
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.Flow

interface CategoryRepository {
    fun observeAll(householdId: SyncId): Flow<List<Category>>
    suspend fun getById(id: SyncId): Category?
}
