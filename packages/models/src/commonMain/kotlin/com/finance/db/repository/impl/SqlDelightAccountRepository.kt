// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.repository.impl

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.finance.db.FinanceDatabase
import com.finance.db.repository.AccountRepository
import com.finance.models.Account
import com.finance.models.AccountType
import com.finance.models.types.Cents
import com.finance.models.util.DateTimeUtil
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlin.coroutines.CoroutineContext

class SqlDelightAccountRepository(
    private val db: FinanceDatabase,
    private val context: CoroutineContext = Dispatchers.Default,
) : AccountRepository {

    private val queries get() = db.accountQueries

    override fun observeAll(): Flow<List<Account>> =
        queries.selectAll(::mapRow).asFlow().mapToList(context)

    override fun observeByHousehold(householdId: String): Flow<List<Account>> =
        queries.selectByHousehold(householdId, ::mapRow).asFlow().mapToList(context)

    override fun observeActive(householdId: String): Flow<List<Account>> =
        queries.selectActive(householdId, ::mapRow).asFlow().mapToList(context)

    override suspend fun getById(id: String): Account? = withContext(context) {
        queries.selectById(id, ::mapRow).executeAsOneOrNull()
    }

    override suspend fun getByOwner(ownerId: String): List<Account> = withContext(context) {
        queries.selectByOwner(ownerId, ::mapRow).executeAsList()
    }

    override suspend fun getByHouseholdAndType(householdId: String, type: AccountType): List<Account> =
        withContext(context) { queries.selectByHouseholdAndType(householdId, type.name, ::mapRow).executeAsList() }

    override suspend fun insert(entity: Account) = withContext(context) {
        queries.insert(
            entity.id.value, entity.householdId.value, entity.ownerId.value,
            entity.name, entity.type.name, entity.currency.code,
            entity.currentBalance.amount, if (entity.isArchived) 1L else 0L,
            entity.sortOrder.toLong(), entity.icon, entity.color,
            entity.createdAt.toString(), entity.updatedAt.toString(),
            entity.syncVersion, 0L,
        )
    }

    override suspend fun update(entity: Account) = withContext(context) {
        val now = DateTimeUtil.now().toString()
        queries.update(
            entity.name, entity.type.name, entity.currency.code,
            entity.currentBalance.amount, if (entity.isArchived) 1L else 0L,
            entity.sortOrder.toLong(), entity.icon, entity.color,
            now, entity.syncVersion + 1, 0L, entity.id.value,
        )
    }

    override suspend fun updateBalance(id: String, newBalance: Cents) = withContext(context) {
        queries.updateBalance(newBalance.amount, DateTimeUtil.now().toString(), id)
    }

    override suspend fun archive(id: String) = withContext(context) {
        queries.archive(DateTimeUtil.now().toString(), id)
    }

    override suspend fun softDelete(id: String) = withContext(context) {
        val now = DateTimeUtil.now().toString()
        queries.softDelete(now, now, id)
    }

    override suspend fun getUnsynced(): List<Account> = withContext(context) {
        queries.selectUnsynced(::mapRow).executeAsList()
    }

    override suspend fun markSynced(id: String, syncVersion: Long) = withContext(context) {
        queries.markSynced(syncVersion, id)
    }

    @Suppress("LongParameterList")
    private fun mapRow(
        id: String, householdId: String, ownerId: String, name: String,
        type: String, currency: String, currentBalance: Long, isArchived: Long,
        sortOrder: Long, icon: String?, color: String?, createdAt: String,
        updatedAt: String, deletedAt: String?, syncVersion: Long, isSynced: Long,
    ): Account = EntityMappers.mapAccount(
        id, householdId, ownerId, name, type, currency, currentBalance,
        isArchived, sortOrder, icon, color, createdAt, updatedAt,
        deletedAt, syncVersion, isSynced,
    )
}
