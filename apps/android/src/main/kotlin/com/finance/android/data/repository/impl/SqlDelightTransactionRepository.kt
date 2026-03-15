// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.impl

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import app.cash.sqldelight.coroutines.mapToOneOrNull
import com.finance.android.data.repository.TransactionRepository
import com.finance.db.FinanceDatabase
import com.finance.db.Transaction as TransactionRow
import com.finance.models.Transaction
import com.finance.models.TransactionStatus
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

/**
 * SQLDelight-backed implementation of [TransactionRepository].
 *
 * Delegates all persistence to the [FinanceDatabase] and maps between
 * SQLDelight-generated row types and domain [Transaction] models. Tags
 * are serialized as a JSON array in the `tags` TEXT column.
 */
class SqlDelightTransactionRepository(
    private val database: FinanceDatabase,
) : TransactionRepository {

    private val queries get() = database.transactionQueries

    private val tagsSerializer = ListSerializer(String.serializer())

    // ── BaseRepository ──────────────────────────────────────────────

    /** @inheritDoc */
    override fun observeAll(householdId: SyncId): Flow<List<Transaction>> =
        queries.selectByHousehold(householdId.value)
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.map { it.toDomain() } }

    /** @inheritDoc */
    override fun observeById(id: SyncId): Flow<Transaction?> =
        queries.selectById(id.value)
            .asFlow()
            .mapToOneOrNull(Dispatchers.IO)
            .map { it?.toDomain() }

    /** @inheritDoc */
    override suspend fun getById(id: SyncId): Transaction? = withContext(Dispatchers.IO) {
        queries.selectById(id.value).executeAsOneOrNull()?.toDomain()
    }

    /** @inheritDoc */
    override suspend fun insert(entity: Transaction) {
        withContext(Dispatchers.IO) {
            queries.insert(
                id = entity.id.value,
                household_id = entity.householdId.value,
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
                tags = Json.encodeToString(tagsSerializer, entity.tags),
                created_at = entity.createdAt.toString(),
                updated_at = entity.updatedAt.toString(),
                sync_version = entity.syncVersion,
                is_synced = if (entity.isSynced) 1L else 0L,
            )
        }
    }

    /** @inheritDoc */
    override suspend fun update(entity: Transaction) {
        withContext(Dispatchers.IO) {
            queries.update(
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
                tags = Json.encodeToString(tagsSerializer, entity.tags),
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
    override suspend fun getUnsynced(householdId: SyncId): List<Transaction> =
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

    // ── TransactionRepository ───────────────────────────────────────

    /** @inheritDoc */
    override fun observeByAccount(accountId: SyncId): Flow<List<Transaction>> =
        queries.selectByAccount(accountId.value)
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.map { it.toDomain() } }

    /** @inheritDoc */
    override fun observeByCategory(categoryId: SyncId): Flow<List<Transaction>> =
        queries.selectByCategory(categoryId.value)
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.map { it.toDomain() } }

    /** @inheritDoc */
    override fun observeByDateRange(
        householdId: SyncId,
        start: LocalDate,
        end: LocalDate,
    ): Flow<List<Transaction>> =
        queries.selectByDateRange(
            household_id = householdId.value,
            date = start.toString(),
            date_ = end.toString(),
        )
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.map { it.toDomain() } }

    /** @inheritDoc */
    override suspend fun getByDateRange(
        householdId: SyncId,
        start: LocalDate,
        end: LocalDate,
    ): List<Transaction> = withContext(Dispatchers.IO) {
        queries.selectByDateRange(
            household_id = householdId.value,
            date = start.toString(),
            date_ = end.toString(),
        )
            .executeAsList()
            .map { it.toDomain() }
    }

    // ── Mapping ─────────────────────────────────────────────────────

    /**
     * Maps a SQLDelight-generated [TransactionRow] to the domain [Transaction] model.
     */
    private fun TransactionRow.toDomain(): Transaction = Transaction(
        id = SyncId(id),
        householdId = SyncId(household_id),
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
        tags = Json.decodeFromString(tagsSerializer, tags),
        createdAt = Instant.parse(created_at),
        updatedAt = Instant.parse(updated_at),
        deletedAt = deleted_at?.let { Instant.parse(it) },
        syncVersion = sync_version,
        isSynced = is_synced != 0L,
    )
}
