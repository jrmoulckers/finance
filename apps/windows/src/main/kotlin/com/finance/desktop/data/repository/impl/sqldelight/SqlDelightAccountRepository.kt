// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.repository.impl.sqldelight

import com.finance.db.FinanceDatabase
import com.finance.desktop.data.repository.AccountRepository
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant

/**
 * SQLDelight-backed implementation of [AccountRepository].
 *
 * Uses the KMP-generated `AccountQueries` from the `packages/models` module
 * to perform all CRUD operations against the encrypted SQLite database.
 *
 * Maintains an in-memory cache via [MutableStateFlow] for reactive observation
 * and refreshes from the database on mutations.
 */
class SqlDelightAccountRepository(
    private val database: FinanceDatabase,
) : AccountRepository {

    private val queries get() = database.accountQueries

    private val _cache = MutableStateFlow<List<Account>>(emptyList())

    init {
        refreshCache()
    }

    override fun observeAll(householdId: SyncId): Flow<List<Account>> =
        _cache.map { list ->
            list.filter { it.householdId == householdId && it.deletedAt == null }
        }

    override fun observeById(id: SyncId): Flow<Account?> =
        _cache.map { list -> list.find { it.id == id && it.deletedAt == null } }

    override suspend fun getById(id: SyncId): Account? =
        _cache.value.find { it.id == id && it.deletedAt == null }

    override suspend fun insert(entity: Account) = withContext(Dispatchers.IO) {
        queries.insert(
            id = entity.id.value,
            household_id = entity.householdId.value,
            owner_id = entity.ownerId.value,
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
        refreshCache()
    }

    override suspend fun update(entity: Account) = withContext(Dispatchers.IO) {
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
        refreshCache()
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

    override fun observeActive(householdId: SyncId): Flow<List<Account>> =
        _cache.map { list ->
            list.filter {
                it.householdId == householdId && !it.isArchived && it.deletedAt == null
            }
        }

    override suspend fun updateBalance(id: SyncId, newBalance: Cents) =
        withContext(Dispatchers.IO) {
            val now = Clock.System.now()
            queries.updateBalance(
                current_balance = newBalance.amount,
                updated_at = now.toString(),
                id = id.value,
            )
            refreshCache()
        }

    private fun refreshCache() {
        @Suppress("TooGenericExceptionCaught") // Database may not be initialized
        try {
            val rows = queries.selectAll().executeAsList()
            _cache.value = rows.map { it.toAccount() }
        } catch (e: Exception) {
            // Database may not be initialized yet; use empty list
            java.util.logging.Logger.getLogger("SqlDelightAccountRepository")
                .warning("Cache refresh failed: ${e.message}")
        }
    }
}

internal fun com.finance.db.Account.toAccount(): Account = Account(
    id = SyncId(id),
    householdId = SyncId(household_id),
    ownerId = SyncId(owner_id),
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
