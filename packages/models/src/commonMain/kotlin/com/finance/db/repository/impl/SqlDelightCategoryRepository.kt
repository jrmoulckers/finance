// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.repository.impl

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.finance.db.FinanceDatabase
import com.finance.db.repository.CategoryRepository
import com.finance.models.Category
import com.finance.models.util.DateTimeUtil
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlin.coroutines.CoroutineContext

class SqlDelightCategoryRepository(
    private val db: FinanceDatabase,
    private val context: CoroutineContext = Dispatchers.Default,
) : CategoryRepository {

    private val queries get() = db.categoryQueries

    override fun observeAll(): Flow<List<Category>> =
        queries.selectAll(::mapRow).asFlow().mapToList(context)

    override fun observeByHousehold(householdId: String): Flow<List<Category>> =
        queries.selectByHousehold(householdId, ::mapRow).asFlow().mapToList(context)

    override suspend fun getById(id: String): Category? = withContext(context) {
        queries.selectById(id, ::mapRow).executeAsOneOrNull()
    }

    override suspend fun getByOwner(ownerId: String): List<Category> = withContext(context) {
        queries.selectByOwner(ownerId, ::mapRow).executeAsList()
    }

    override suspend fun getTopLevel(householdId: String): List<Category> = withContext(context) {
        queries.selectTopLevel(householdId, ::mapRow).executeAsList()
    }

    override suspend fun getSubcategories(parentId: String): List<Category> = withContext(context) {
        queries.selectSubcategories(parentId, ::mapRow).executeAsList()
    }

    override suspend fun getIncomeCategories(householdId: String): List<Category> = withContext(context) {
        queries.selectIncomeCategories(householdId, ::mapRow).executeAsList()
    }

    override suspend fun getExpenseCategories(householdId: String): List<Category> = withContext(context) {
        queries.selectExpenseCategories(householdId, ::mapRow).executeAsList()
    }

    override suspend fun insert(entity: Category) = withContext(context) {
        queries.insert(
            entity.id.value, entity.householdId.value, entity.ownerId.value,
            entity.name, entity.icon, entity.color, entity.parentId?.value,
            if (entity.isIncome) 1L else 0L, if (entity.isSystem) 1L else 0L,
            entity.sortOrder.toLong(), entity.createdAt.toString(),
            entity.updatedAt.toString(), entity.syncVersion, 0L,
        )
    }

    override suspend fun update(entity: Category) = withContext(context) {
        val now = DateTimeUtil.now().toString()
        queries.update(
            entity.name, entity.icon, entity.color, entity.parentId?.value,
            if (entity.isIncome) 1L else 0L, entity.sortOrder.toLong(),
            now, entity.syncVersion + 1, 0L, entity.id.value,
        )
    }

    override suspend fun softDelete(id: String) = withContext(context) {
        val now = DateTimeUtil.now().toString()
        queries.softDelete(now, now, id)
    }

    override suspend fun getUnsynced(): List<Category> = withContext(context) {
        queries.selectUnsynced(::mapRow).executeAsList()
    }

    override suspend fun markSynced(id: String, syncVersion: Long) = withContext(context) {
        queries.markSynced(syncVersion, id)
    }

    @Suppress("LongParameterList")
    private fun mapRow(
        id: String, household_id: String, owner_id: String, name: String,
        icon: String?, color: String?, parent_id: String?, is_income: Long,
        is_system: Long, sort_order: Long, created_at: String, updated_at: String,
        deleted_at: String?, sync_version: Long, is_synced: Long,
    ): Category = EntityMappers.mapCategory(
        id, household_id, owner_id, name, icon, color, parent_id,
        is_income, is_system, sort_order, created_at, updated_at,
        deleted_at, sync_version, is_synced,
    )
}
