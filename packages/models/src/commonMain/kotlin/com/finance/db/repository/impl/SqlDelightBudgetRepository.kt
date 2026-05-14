// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.repository.impl

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.finance.db.FinanceDatabase
import com.finance.db.repository.BudgetRepository
import com.finance.models.Budget
import com.finance.models.BudgetPeriod
import com.finance.models.util.DateTimeUtil
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlin.coroutines.CoroutineContext

class SqlDelightBudgetRepository(
    private val db: FinanceDatabase,
    private val context: CoroutineContext = Dispatchers.Default,
) : BudgetRepository {

    private val queries get() = db.budgetQueries

    override fun observeAll(): Flow<List<Budget>> =
        queries.selectAll(::mapRow).asFlow().mapToList(context)

    override fun observeByHousehold(householdId: String): Flow<List<Budget>> =
        queries.selectByHousehold(householdId, ::mapRow).asFlow().mapToList(context)

    override suspend fun getById(id: String): Budget? = withContext(context) {
        queries.selectById(id, ::mapRow).executeAsOneOrNull()
    }

    override suspend fun getByOwner(ownerId: String): List<Budget> = withContext(context) {
        queries.selectByOwner(ownerId, ::mapRow).executeAsList()
    }

    override suspend fun getByCategory(categoryId: String): List<Budget> = withContext(context) {
        queries.selectByCategory(categoryId, ::mapRow).executeAsList()
    }

    override suspend fun getByPeriod(householdId: String, period: BudgetPeriod): List<Budget> =
        withContext(context) { queries.selectByPeriod(householdId, period.name, ::mapRow).executeAsList() }

    override suspend fun getActive(householdId: String, today: String): List<Budget> =
        withContext(context) { queries.selectActive(householdId, today, ::mapRow).executeAsList() }

    override suspend fun insert(entity: Budget) = withContext(context) {
        queries.insert(
            entity.id.value, entity.householdId.value, entity.ownerId.value,
            entity.categoryId.value, entity.name, entity.amount.amount,
            entity.currency.code, entity.period.name, entity.startDate.toString(),
            entity.endDate?.toString(), if (entity.isRollover) 1L else 0L,
            entity.createdAt.toString(), entity.updatedAt.toString(),
            entity.syncVersion, 0L,
        )
    }

    override suspend fun update(entity: Budget) = withContext(context) {
        val now = DateTimeUtil.now().toString()
        queries.update(
            entity.categoryId.value, entity.name, entity.amount.amount,
            entity.currency.code, entity.period.name, entity.startDate.toString(),
            entity.endDate?.toString(), if (entity.isRollover) 1L else 0L,
            now, entity.syncVersion + 1, 0L, entity.id.value,
        )
    }

    override suspend fun softDelete(id: String) = withContext(context) {
        val now = DateTimeUtil.now().toString()
        queries.softDelete(now, now, id)
    }

    override suspend fun getUnsynced(): List<Budget> = withContext(context) {
        queries.selectUnsynced(::mapRow).executeAsList()
    }

    override suspend fun markSynced(id: String, syncVersion: Long) = withContext(context) {
        queries.markSynced(syncVersion, id)
    }

    @Suppress("LongParameterList")
    private fun mapRow(
        id: String, householdId: String, ownerId: String, categoryId: String,
        name: String, amount: Long, currency: String, period: String,
        startDate: String, endDate: String?, isRollover: Long,
        createdAt: String, updatedAt: String, deletedAt: String?,
        syncVersion: Long, isSynced: Long,
    ): Budget = EntityMappers.mapBudget(
        id, householdId, ownerId, categoryId, name, amount, currency,
        period, startDate, endDate, isRollover, createdAt, updatedAt,
        deletedAt, syncVersion, isSynced,
    )
}
