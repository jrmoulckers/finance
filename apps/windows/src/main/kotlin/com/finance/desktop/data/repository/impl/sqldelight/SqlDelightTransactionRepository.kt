// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.repository.impl.sqldelight

import com.finance.db.FinanceDatabase
import com.finance.desktop.data.repository.TransactionRepository
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate

/**
 * SQLDelight-backed implementation of [TransactionRepository].
 *
 * Maps to `TransactionQueries` generated from `Transaction.sq` in the
 * KMP `packages/models` module.
 */
class SqlDelightTransactionRepository(
    private val database: FinanceDatabase,
) : TransactionRepository {

    private val queries get() = database.transactionQueries

    private val _cache = MutableStateFlow<List<Transaction>>(emptyList())

    init {
        refreshCache()
    }

    override fun observeAll(householdId: SyncId): Flow<List<Transaction>> =
        _cache.map { list ->
            list.filter { it.householdId == householdId && it.deletedAt == null }
        }

    override fun observeById(id: SyncId): Flow<Transaction?> =
        _cache.map { list -> list.find { it.id == id && it.deletedAt == null } }

    override fun observeByAccount(accountId: SyncId): Flow<List<Transaction>> =
        _cache.map { list ->
            list.filter { it.accountId == accountId && it.deletedAt == null }
        }

    override fun observeByDateRange(
        householdId: SyncId,
        start: LocalDate,
        end: LocalDate,
    ): Flow<List<Transaction>> =
        _cache.map { list ->
            list.filter {
                it.householdId == householdId &&
                    it.date >= start && it.date <= end &&
                    it.deletedAt == null
            }
        }

    override suspend fun insert(entity: Transaction) = withContext(Dispatchers.IO) {
        queries.insert(
            id = entity.id.value,
            household_id = entity.householdId.value,
            owner_id = entity.ownerId.value,
            account_id = entity.accountId.value,
            category_id = entity.categoryId?.value,
            type = entity.type.name,
            status = entity.status.name,
            amount = entity.amount.amount,
            currency = entity.currency.code,
            payee = entity.payee,
            note = entity.note,
            date = entity.date.toString(),
            transfer_account_id = entity.transferAccountId?.value,
            transfer_transaction_id = entity.transferTransactionId?.value,
            is_recurring = if (entity.isRecurring) 1L else 0L,
            recurring_rule_id = entity.recurringRuleId?.value,
            tags = entity.tags.joinToString(","),
            mood_tag = entity.moodTag,
            created_at = entity.createdAt.toString(),
            updated_at = entity.updatedAt.toString(),
            sync_version = entity.syncVersion,
            is_synced = if (entity.isSynced) 1L else 0L,
        )
        refreshCache()
    }

    override suspend fun eraseAllMoodTags(): Int = withContext(Dispatchers.IO) {
        val taggedCount = queries.selectAll().executeAsList().count { it.mood_tag != null }
        if (taggedCount > 0) queries.eraseAllMoodTags(Clock.System.now().toString())
        refreshCache()
        taggedCount
    }

    override suspend fun delete(id: SyncId) = withContext(Dispatchers.IO) {
        val now = Clock.System.now()
        queries.softDelete(
            deleted_at = now.toString(),
            updated_at = now.toString(),
            id = id.value,
        )
        refreshCache()
    }

    private fun refreshCache() {
        try {
            val rows = queries.selectAll().executeAsList()
            _cache.value = rows.map { it.toTransaction() }
        } catch (_: Exception) {
            // Database may not be initialized yet
        }
    }
}

@Suppress("CyclomaticComplexMethod")
internal fun com.finance.db.Transaction.toTransaction(): Transaction = Transaction(
    id = SyncId(id),
    householdId = SyncId(household_id),
    ownerId = SyncId(owner_id),
    accountId = SyncId(account_id),
    categoryId = category_id?.let { SyncId(it) },
    type = TransactionType.valueOf(type),
    status = TransactionStatus.valueOf(status),
    amount = Cents(amount),
    currency = Currency(currency),
    payee = payee,
    note = note,
    date = LocalDate.parse(date),
    transferAccountId = transfer_account_id?.let { SyncId(it) },
    transferTransactionId = transfer_transaction_id?.let { SyncId(it) },
    isRecurring = is_recurring != 0L,
    recurringRuleId = recurring_rule_id?.let { SyncId(it) },
    tags = tags.split(",").filter { it.isNotBlank() },
    moodTag = mood_tag,
    createdAt = Instant.parse(created_at),
    updatedAt = Instant.parse(updated_at),
    deletedAt = deleted_at?.let { Instant.parse(it) },
    syncVersion = sync_version,
    isSynced = is_synced != 0L,
)
