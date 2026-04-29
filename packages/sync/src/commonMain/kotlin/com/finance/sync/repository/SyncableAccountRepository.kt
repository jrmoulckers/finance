// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.repository

import com.finance.db.FinanceDatabase
import com.finance.db.repository.AccountRepository
import com.finance.db.repository.impl.SqlDelightAccountRepository
import com.finance.models.Account
import com.finance.models.AccountType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.datetime.Instant
import kotlin.coroutines.CoroutineContext

class SyncableAccountRepository(
    db: FinanceDatabase,
    context: CoroutineContext = Dispatchers.Default,
) : SyncableRepository<Account>, AccountRepository by SqlDelightAccountRepository(db, context) {

    override val tableName: String = "account"
    private val delegate = SqlDelightAccountRepository(db, context)

    override suspend fun applySyncChange(rowData: Map<String, String?>, isDelete: Boolean, syncVersion: Long) {
        val id = rowData["id"] ?: return
        if (isDelete) { delegate.softDelete(id); delegate.markSynced(id, syncVersion); return }
        val existing = delegate.getById(id)
        val now = rowData["updated_at"] ?: Instant.DISTANT_PAST.toString()
        val account = Account(
            id = SyncId(id), householdId = SyncId(rowData["household_id"] ?: return),
            ownerId = SyncId(rowData["owner_id"] ?: return), name = rowData["name"] ?: return,
            type = AccountType.valueOf(rowData["type"] ?: "CHECKING"),
            currency = Currency(rowData["currency"] ?: "USD"),
            currentBalance = Cents(rowData["current_balance"]?.toLongOrNull() ?: 0L),
            isArchived = rowData["is_archived"] == "1",
            sortOrder = rowData["sort_order"]?.toIntOrNull() ?: 0,
            icon = rowData["icon"], color = rowData["color"],
            createdAt = Instant.parse(rowData["created_at"] ?: now), updatedAt = Instant.parse(now),
            syncVersion = syncVersion, isSynced = true,
        )
        if (existing == null) delegate.insert(account) else delegate.update(account)
        delegate.markSynced(id, syncVersion)
    }

    override suspend fun toRowData(entity: Account): Map<String, String?> = mapOf(
        "id" to entity.id.value, "household_id" to entity.householdId.value,
        "owner_id" to entity.ownerId.value, "name" to entity.name,
        "type" to entity.type.name, "currency" to entity.currency.code,
        "current_balance" to entity.currentBalance.amount.toString(),
        "is_archived" to if (entity.isArchived) "1" else "0",
        "sort_order" to entity.sortOrder.toString(), "icon" to entity.icon,
        "color" to entity.color, "created_at" to entity.createdAt.toString(),
        "updated_at" to entity.updatedAt.toString(), "deleted_at" to entity.deletedAt?.toString(),
        "sync_version" to entity.syncVersion.toString(),
    )

    override fun observeUnsyncedCount(): Flow<Int> =
        observeAll().map { it.count { a -> !a.isSynced } }
}
