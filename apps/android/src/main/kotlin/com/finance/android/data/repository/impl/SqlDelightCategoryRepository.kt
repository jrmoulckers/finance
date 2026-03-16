// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.impl

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import app.cash.sqldelight.coroutines.mapToOneOrNull
import com.finance.android.data.repository.CategoryRepository
import com.finance.db.Category as CategoryRow
import com.finance.db.FinanceDatabase
import com.finance.models.Category
import com.finance.models.types.SyncId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant

/**
 * SQLDelight-backed implementation of [CategoryRepository].
 *
 * Delegates all persistence to the [FinanceDatabase] and maps between
 * SQLDelight-generated row types and domain [Category] models.
 */
class SqlDelightCategoryRepository(
    private val database: FinanceDatabase,
) : CategoryRepository {

    private val queries get() = database.categoryQueries

    // ── BaseRepository ──────────────────────────────────────────────

    /** @inheritDoc */
    override fun observeAll(householdId: SyncId): Flow<List<Category>> =
        queries.selectByHousehold(householdId.value)
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.map { it.toDomain() } }

    /** @inheritDoc */
    override fun observeById(id: SyncId): Flow<Category?> =
        queries.selectById(id.value)
            .asFlow()
            .mapToOneOrNull(Dispatchers.IO)
            .map { it?.toDomain() }

    /** @inheritDoc */
    override suspend fun getById(id: SyncId): Category? = withContext(Dispatchers.IO) {
        queries.selectById(id.value).executeAsOneOrNull()?.toDomain()
    }

    /** @inheritDoc */
    override suspend fun insert(entity: Category) {
        withContext(Dispatchers.IO) {
            queries.insert(
                id = entity.id.value,
                household_id = entity.householdId.value,
                name = entity.name,
                icon = entity.icon,
                color = entity.color,
                parent_id = entity.parentId?.value,
                is_income = if (entity.isIncome) 1L else 0L,
                is_system = if (entity.isSystem) 1L else 0L,
                sort_order = entity.sortOrder.toLong(),
                created_at = entity.createdAt.toString(),
                updated_at = entity.updatedAt.toString(),
                sync_version = entity.syncVersion,
                is_synced = if (entity.isSynced) 1L else 0L,
            )
        }
    }

    /** @inheritDoc */
    override suspend fun update(entity: Category) {
        withContext(Dispatchers.IO) {
            queries.update(
                name = entity.name,
                icon = entity.icon,
                color = entity.color,
                parent_id = entity.parentId?.value,
                is_income = if (entity.isIncome) 1L else 0L,
                sort_order = entity.sortOrder.toLong(),
                updated_at = entity.updatedAt.toString(),
                sync_version = entity.syncVersion,
                is_synced = if (entity.isSynced) 1L else 0L,
                id = entity.id.value,
            )
        }
    }

    /** @inheritDoc */
    override suspend fun delete(id: SyncId) {
        val now = Clock.System.now().toString()
        withContext(Dispatchers.IO) {
            queries.softDelete(deleted_at = now, updated_at = now, id = id.value)
        }
    }

    /** @inheritDoc */
    override suspend fun getUnsynced(householdId: SyncId): List<Category> =
        withContext(Dispatchers.IO) {
            queries.selectUnsyncedByHousehold(householdId.value)
                .executeAsList()
                .map { it.toDomain() }
        }

    /** @inheritDoc */
    override suspend fun markSynced(ids: List<SyncId>) {
        if (ids.isEmpty()) return
        withContext(Dispatchers.IO) {
            database.transaction {
                ids.forEach { id ->
                    queries.markSyncedById(id.value)
                }
            }
        }
    }

    // ── CategoryRepository ──────────────────────────────────────────

    /**
     * @inheritDoc
     *
     * When [parentId] is `null`, returns root-level categories (no parent).
     * When non-null, returns subcategories of the given parent.
     */
    override fun observeByParent(parentId: SyncId?): Flow<List<Category>> {
        val query = if (parentId == null) {
            queries.selectRootCategories()
        } else {
            queries.selectSubcategories(parentId.value)
        }
        return query
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.map { it.toDomain() } }
    }

    /** @inheritDoc */
    override fun observeIncome(householdId: SyncId): Flow<List<Category>> =
        queries.selectIncomeCategories(householdId.value)
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.map { it.toDomain() } }

    /** @inheritDoc */
    override fun observeExpense(householdId: SyncId): Flow<List<Category>> =
        queries.selectExpenseCategories(householdId.value)
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.map { it.toDomain() } }

    // ── Mapping ─────────────────────────────────────────────────────

    /**
     * Maps a SQLDelight-generated [CategoryRow] to the domain [Category] model.
     */
    private fun CategoryRow.toDomain(): Category = Category(
        id = SyncId(id),
        householdId = SyncId(household_id),
        name = name,
        icon = icon,
        color = color,
        parentId = parent_id?.let { SyncId(it) },
        isIncome = is_income != 0L,
        isSystem = is_system != 0L,
        sortOrder = sort_order.toInt(),
        createdAt = Instant.parse(created_at),
        updatedAt = Instant.parse(updated_at),
        deletedAt = deleted_at?.let { Instant.parse(it) },
        syncVersion = sync_version,
        isSynced = is_synced != 0L,
    )
}
