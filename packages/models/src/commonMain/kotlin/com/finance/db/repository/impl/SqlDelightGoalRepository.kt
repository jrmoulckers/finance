// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.repository.impl

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.finance.db.FinanceDatabase
import com.finance.db.repository.GoalRepository
import com.finance.models.Goal
import com.finance.models.GoalStatus
import com.finance.models.types.Cents
import com.finance.models.util.DateTimeUtil
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlin.coroutines.CoroutineContext

class SqlDelightGoalRepository(
    private val db: FinanceDatabase,
    private val context: CoroutineContext = Dispatchers.Default,
) : GoalRepository {

    private val queries get() = db.goalQueries

    override fun observeAll(): Flow<List<Goal>> =
        queries.selectAll(::mapRow).asFlow().mapToList(context)

    override fun observeByHousehold(householdId: String): Flow<List<Goal>> =
        queries.selectByHousehold(householdId, ::mapRow).asFlow().mapToList(context)

    override fun observeActive(householdId: String): Flow<List<Goal>> =
        queries.selectActive(householdId, ::mapRow).asFlow().mapToList(context)

    override suspend fun getById(id: String): Goal? = withContext(context) {
        queries.selectById(id, ::mapRow).executeAsOneOrNull()
    }

    override suspend fun getByOwner(ownerId: String): List<Goal> = withContext(context) {
        queries.selectByOwner(ownerId, ::mapRow).executeAsList()
    }

    override suspend fun getByStatus(householdId: String, status: GoalStatus): List<Goal> =
        withContext(context) { queries.selectByStatus(householdId, status.name, ::mapRow).executeAsList() }

    override suspend fun getByAccount(accountId: String): List<Goal> = withContext(context) {
        queries.selectByAccount(accountId, ::mapRow).executeAsList()
    }

    override suspend fun updateProgress(id: String, currentAmount: Cents) = withContext(context) {
        queries.updateProgress(currentAmount.amount, DateTimeUtil.now().toString(), id)
    }

    override suspend fun updateStatus(id: String, status: GoalStatus) = withContext(context) {
        queries.updateStatus(status.name, DateTimeUtil.now().toString(), id)
    }

    override suspend fun insert(entity: Goal) = withContext(context) {
        queries.insert(
            entity.id.value, entity.householdId.value, entity.ownerId.value,
            entity.name, entity.targetAmount.amount, entity.currentAmount.amount,
            entity.currency.code, entity.targetDate?.toString(), entity.status.name,
            entity.icon, entity.color, entity.accountId?.value,
            entity.createdAt.toString(), entity.updatedAt.toString(),
            entity.syncVersion, 0L,
        )
    }

    override suspend fun update(entity: Goal) = withContext(context) {
        val now = DateTimeUtil.now().toString()
        queries.update(
            entity.name, entity.targetAmount.amount, entity.currentAmount.amount,
            entity.currency.code, entity.targetDate?.toString(), entity.status.name,
            entity.icon, entity.color, entity.accountId?.value,
            now, entity.syncVersion + 1, 0L, entity.id.value,
        )
    }

    override suspend fun softDelete(id: String) = withContext(context) {
        val now = DateTimeUtil.now().toString()
        queries.softDelete(now, now, id)
    }

    override suspend fun getUnsynced(): List<Goal> = withContext(context) {
        queries.selectUnsynced(::mapRow).executeAsList()
    }

    override suspend fun markSynced(id: String, syncVersion: Long) = withContext(context) {
        queries.markSynced(syncVersion, id)
    }

    @Suppress("LongParameterList")
    private fun mapRow(
        id: String, household_id: String, owner_id: String, name: String,
        target_amount: Long, current_amount: Long, currency: String,
        target_date: String?, status: String, icon: String?, color: String?,
        account_id: String?, created_at: String, updated_at: String,
        deleted_at: String?, sync_version: Long, is_synced: Long,
    ): Goal = EntityMappers.mapGoal(
        id, household_id, owner_id, name, target_amount, current_amount,
        currency, target_date, status, icon, color, account_id,
        created_at, updated_at, deleted_at, sync_version, is_synced,
    )
}
