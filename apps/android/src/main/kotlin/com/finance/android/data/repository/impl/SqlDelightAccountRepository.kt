// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.impl

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import app.cash.sqldelight.coroutines.mapToOneOrNull
import com.finance.android.data.repository.AccountRepository
import com.finance.db.Account as AccountRow
import com.finance.db.FinanceDatabase
import com.finance.models.Account
import com.finance.models.AccountType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant

/**
 * SQLDelight-backed implementation of [AccountRepository].
 *
 * Delegates all persistence to the [FinanceDatabase] and maps between
 * SQLDelight-generated row types and domain [Account] models. All
 * blocking database I/O is dispatched to [Dispatchers.IO].
 */
class SqlDelightAccountRepository(
    private val database: FinanceDatabase,
) : AccountRepository {

    private val queries get() = database.accountQueries

    // ── BaseRepository ──────────────────────────────────────────────

    /** @inheritDoc */
    override fun observeAll(householdId: SyncId): Flow<List<Account>> =
        queries.selectByHousehold(householdId.value)
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.map { it.toDomain() } }

    /** @inheritDoc */
    override fun observeById(id: SyncId): Flow<Account?> =
        queries.selectById(id.value)
            .asFlow()
            .mapToOneOrNull(Dispatchers.IO)
            .map { it?.toDomain() }

    /** @inheritDoc */
    override suspend fun getById(id: SyncId): Account? = withContext(Dispatchers.IO) {
        queries.selectById(id.value).executeAsOneOrNull()?.toDomain()
    }

    /** @inheritDoc */
    override suspend fun insert(entity: Account) {
        withContext(Dispatchers.IO) {
            queries.insert(
                id = entity.id.value,
                household_id = entity.householdId.value,
                name = entity.name,
                type = entity.type.name,
                currency = entity.currency.code,
                current_balance = entity.currentBalance.amount,
                is_archived = if (entity.isArchived) 1L else 0L,
                sort_order = entity.sortOrder.toLong(),
                icon = entity.icon,
                color = entity.color,
                created_at = entity.createdAt.toString(),
                updated_at = entity.updatedAt.toString(),
                sync_version = entity.syncVersion,
                is_synced = if (entity.isSynced) 1L else 0L,
            )
        }
    }

    /** @inheritDoc */
    override suspend fun update(entity: Account) {
        withContext(Dispatchers.IO) {
            queries.update(
                name = entity.name,
                type = entity.type.name,
                currency = entity.currency.code,
                current_balance = entity.currentBalance.amount,
                is_archived = if (entity.isArchived) 1L else 0L,
                sort_order = entity.sortOrder.toLong(),
                icon = entity.icon,
                color = entity.color,
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
    override suspend fun getUnsynced(householdId: SyncId): List<Account> =
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

    // ── AccountRepository ───────────────────────────────────────────

    /** @inheritDoc */
    override fun observeActive(householdId: SyncId): Flow<List<Account>> =
        queries.selectActive(householdId.value)
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.map { it.toDomain() } }

    /** @inheritDoc */
    override suspend fun updateBalance(id: SyncId, newBalance: Cents) {
        val now = Clock.System.now().toString()
        withContext(Dispatchers.IO) {
            queries.updateBalance(
                current_balance = newBalance.amount,
                updated_at = now,
                id = id.value,
            )
        }
    }

    /** @inheritDoc */
    override suspend fun archive(id: SyncId) {
        val now = Clock.System.now().toString()
        withContext(Dispatchers.IO) {
            queries.archive(updated_at = now, id = id.value)
        }
    }

    // ── Mapping ─────────────────────────────────────────────────────

    /**
     * Maps a SQLDelight-generated [AccountRow] to the domain [Account] model.
     */
    private fun AccountRow.toDomain(): Account = Account(
        id = SyncId(id),
        householdId = SyncId(household_id),
        name = name,
        type = AccountType.valueOf(type),
        currency = Currency(currency),
        currentBalance = Cents(current_balance),
        isArchived = is_archived != 0L,
        sortOrder = sort_order.toInt(),
        icon = icon,
        color = color,
        createdAt = Instant.parse(created_at),
        updatedAt = Instant.parse(updated_at),
        deletedAt = deleted_at?.let { Instant.parse(it) },
        syncVersion = sync_version,
        isSynced = is_synced != 0L,
    )
}
