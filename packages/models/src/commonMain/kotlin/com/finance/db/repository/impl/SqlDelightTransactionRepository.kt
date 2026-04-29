// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.repository.impl

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.finance.db.FinanceDatabase
import com.finance.db.repository.TransactionRepository
import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.util.DateTimeUtil
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlin.coroutines.CoroutineContext

class SqlDelightTransactionRepository(
    private val db: FinanceDatabase,
    private val context: CoroutineContext = Dispatchers.Default,
) : TransactionRepository {

    private val queries get() = db.transactionQueries

    override fun observeAll(): Flow<List<Transaction>> =
        queries.selectAll(::mapRow).asFlow().mapToList(context)

    override fun observeByHousehold(householdId: String): Flow<List<Transaction>> =
        queries.selectByHousehold(householdId, ::mapRow).asFlow().mapToList(context)

    override fun observeByAccount(accountId: String): Flow<List<Transaction>> =
        queries.selectByAccount(accountId, ::mapRow).asFlow().mapToList(context)

    override suspend fun getById(id: String): Transaction? = withContext(context) {
        queries.selectById(id, ::mapRow).executeAsOneOrNull()
    }

    override suspend fun getByOwner(ownerId: String): List<Transaction> = withContext(context) {
        queries.selectByOwner(ownerId, ::mapRow).executeAsList()
    }

    override suspend fun getByCategory(categoryId: String): List<Transaction> = withContext(context) {
        queries.selectByCategory(categoryId, ::mapRow).executeAsList()
    }

    override suspend fun getByDateRange(householdId: String, startDate: String, endDate: String): List<Transaction> =
        withContext(context) { queries.selectByDateRange(householdId, startDate, endDate, ::mapRow).executeAsList() }

    override suspend fun getByAccountAndDateRange(accountId: String, startDate: String, endDate: String): List<Transaction> =
        withContext(context) { queries.selectByAccountAndDateRange(accountId, startDate, endDate, ::mapRow).executeAsList() }

    override suspend fun getByType(householdId: String, type: TransactionType): List<Transaction> =
        withContext(context) { queries.selectByType(householdId, type.name, ::mapRow).executeAsList() }

    override suspend fun sumByCategory(householdId: String, startDate: String, endDate: String, type: TransactionType): Map<String?, Long> =
        withContext(context) {
            queries.sumByCategory(householdId, startDate, endDate, type.name)
                .executeAsList().associate { it.category_id to (it.total ?: 0L) }
        }

    override suspend fun sumByAccount(householdId: String, startDate: String, endDate: String): Map<String, Long> =
        withContext(context) {
            queries.sumByAccount(householdId, startDate, endDate)
                .executeAsList().associate { it.account_id to (it.total ?: 0L) }
        }

    override suspend fun insert(entity: Transaction) = withContext(context) {
        queries.insert(
            entity.id.value, entity.householdId.value, entity.ownerId.value,
            entity.accountId.value, entity.categoryId?.value, entity.type.name,
            entity.status.name, entity.amount.amount, entity.currency.code,
            entity.payee, entity.note, entity.date.toString(),
            entity.transferAccountId?.value, entity.transferTransactionId?.value,
            if (entity.isRecurring) 1L else 0L, entity.recurringRuleId?.value,
            EntityMappers.serializeTags(entity.tags),
            entity.createdAt.toString(), entity.updatedAt.toString(),
            entity.syncVersion, 0L,
        )
    }

    override suspend fun update(entity: Transaction) = withContext(context) {
        val now = DateTimeUtil.now().toString()
        queries.update(
            entity.accountId.value, entity.categoryId?.value, entity.type.name,
            entity.status.name, entity.amount.amount, entity.currency.code,
            entity.payee, entity.note, entity.date.toString(),
            entity.transferAccountId?.value, entity.transferTransactionId?.value,
            if (entity.isRecurring) 1L else 0L, entity.recurringRuleId?.value,
            EntityMappers.serializeTags(entity.tags),
            now, entity.syncVersion + 1, 0L, entity.id.value,
        )
    }

    override suspend fun softDelete(id: String) = withContext(context) {
        val now = DateTimeUtil.now().toString()
        queries.softDelete(now, now, id)
    }

    override suspend fun getUnsynced(): List<Transaction> = withContext(context) {
        queries.selectUnsynced(::mapRow).executeAsList()
    }

    override suspend fun markSynced(id: String, syncVersion: Long) = withContext(context) {
        queries.markSynced(syncVersion, id)
    }

    @Suppress("LongParameterList")
    private fun mapRow(
        id: String, household_id: String, owner_id: String, account_id: String,
        category_id: String?, type: String, status: String, amount: Long,
        currency: String, payee: String?, note: String?, date: String,
        transfer_account_id: String?, transfer_transaction_id: String?,
        is_recurring: Long, recurring_rule_id: String?, tags: String,
        created_at: String, updated_at: String, deleted_at: String?,
        sync_version: Long, is_synced: Long,
    ): Transaction = EntityMappers.mapTransaction(
        id, household_id, owner_id, account_id, category_id, type, status,
        amount, currency, payee, note, date, transfer_account_id,
        transfer_transaction_id, is_recurring, recurring_rule_id, tags,
        created_at, updated_at, deleted_at, sync_version, is_synced,
    )
}
