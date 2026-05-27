// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.repository.impl

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.finance.db.FinanceDatabase
import com.finance.db.repository.LiabilityRepository
import com.finance.models.Liability
import com.finance.models.util.DateTimeUtil
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlinx.datetime.LocalDate
import kotlin.coroutines.CoroutineContext

/** SQLDelight-backed repository for first-class liabilities. */
class SqlDelightLiabilityRepository(
    private val db: FinanceDatabase,
    private val context: CoroutineContext = Dispatchers.Default,
) : LiabilityRepository {

    private val queries get() = db.liabilityQueries

    override fun observeAll(): Flow<List<Liability>> =
        queries.selectAll(::mapRow).asFlow().mapToList(context)

    override fun observeByHousehold(householdId: String): Flow<List<Liability>> =
        queries.selectByHousehold(householdId, ::mapRow).asFlow().mapToList(context)

    override suspend fun getById(id: String): Liability? = withContext(context) {
        queries.selectById(id, ::mapRow).executeAsOneOrNull()
    }

    override suspend fun getByOwner(ownerId: String): List<Liability> = withContext(context) {
        queries.selectByOwner(ownerId, ::mapRow).executeAsList()
    }

    override suspend fun getActiveByHousehold(householdId: String): List<Liability> = withContext(context) {
        queries.selectActiveByHousehold(householdId, ::mapRow).executeAsList()
    }

    override suspend fun insert(entity: Liability) = withContext(context) {
        queries.insert(
            entity.id.value, entity.householdId.value, entity.ownerId.value,
            entity.type.name, entity.status.name, entity.provider, entity.merchantName,
            entity.originalAmount.amount, entity.remainingBalance.amount, entity.currency.code,
            entity.openedDate.toString(), entity.closedDate?.toString(), entity.accountId?.value,
            entity.note, entity.createdAt.toString(), entity.updatedAt.toString(),
            entity.syncVersion, 0L,
        )
    }

    override suspend fun update(entity: Liability) = withContext(context) {
        val now = DateTimeUtil.now().toString()
        queries.update(
            entity.type.name, entity.status.name, entity.provider, entity.merchantName,
            entity.originalAmount.amount, entity.remainingBalance.amount, entity.currency.code,
            entity.openedDate.toString(), entity.closedDate?.toString(), entity.accountId?.value,
            entity.note, now, entity.syncVersion + 1, 0L, entity.id.value,
        )
    }

    override suspend fun updateRemainingBalance(id: String, remainingBalanceCents: Long) = withContext(context) {
        queries.updateRemainingBalance(remainingBalanceCents, DateTimeUtil.now().toString(), id)
    }

    override suspend fun close(id: String, closedDate: LocalDate) = withContext(context) {
        val now = DateTimeUtil.now().toString()
        queries.close(closedDate.toString(), now, id)
    }

    override suspend fun softDelete(id: String) = withContext(context) {
        val now = DateTimeUtil.now().toString()
        queries.softDelete(now, now, id)
    }

    override suspend fun getUnsynced(): List<Liability> = withContext(context) {
        queries.selectUnsynced(::mapRow).executeAsList()
    }

    override suspend fun markSynced(id: String, syncVersion: Long) = withContext(context) {
        queries.markSynced(syncVersion, id)
    }

    @Suppress("LongParameterList")
    private fun mapRow(
        id: String, householdId: String, ownerId: String, type: String, status: String,
        provider: String, merchantName: String, originalAmount: Long, remainingBalance: Long,
        currency: String, openedDate: String, closedDate: String?, accountId: String?, note: String?,
        createdAt: String, updatedAt: String, deletedAt: String?, syncVersion: Long, isSynced: Long,
    ): Liability = EntityMappers.mapLiability(
        id, householdId, ownerId, type, status, provider, merchantName, originalAmount,
        remainingBalance, currency, openedDate, closedDate, accountId, note, createdAt,
        updatedAt, deletedAt, syncVersion, isSynced,
    )
}
