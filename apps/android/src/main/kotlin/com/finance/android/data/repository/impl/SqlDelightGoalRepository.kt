// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.impl

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import app.cash.sqldelight.coroutines.mapToOneOrNull
import com.finance.android.data.repository.GoalRepository
import com.finance.db.FinanceDatabase
import com.finance.db.Goal as GoalRow
import com.finance.models.Goal
import com.finance.models.GoalStatus
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

/**
 * SQLDelight-backed implementation of [GoalRepository].
 *
 * Delegates all persistence to the [FinanceDatabase] and maps between
 * SQLDelight-generated row types and domain [Goal] models.
 */
class SqlDelightGoalRepository(
    private val database: FinanceDatabase,
) : GoalRepository {

    private val queries get() = database.goalQueries

    // ── BaseRepository ──────────────────────────────────────────────

    /** @inheritDoc */
    override fun observeAll(householdId: SyncId): Flow<List<Goal>> =
        queries.selectByHousehold(householdId.value)
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.map { it.toDomain() } }

    /** @inheritDoc */
    override fun observeById(id: SyncId): Flow<Goal?> =
        queries.selectById(id.value)
            .asFlow()
            .mapToOneOrNull(Dispatchers.IO)
            .map { it?.toDomain() }

    /** @inheritDoc */
    override suspend fun getById(id: SyncId): Goal? = withContext(Dispatchers.IO) {
        queries.selectById(id.value).executeAsOneOrNull()?.toDomain()
    }

    /** @inheritDoc */
    override suspend fun insert(entity: Goal) {
        withContext(Dispatchers.IO) {
            queries.insert(
                id = entity.id.value,
                household_id = entity.householdId.value,
                name = entity.name,
                target_amount = entity.targetAmount.amount,
                current_amount = entity.currentAmount.amount,
                currency = entity.currency.code,
                target_date = entity.targetDate?.toString(),
                status = entity.status.name,
                icon = entity.icon,
                color = entity.color,
                account_id = entity.accountId?.value,
                created_at = entity.createdAt.toString(),
                updated_at = entity.updatedAt.toString(),
                sync_version = entity.syncVersion,
                is_synced = if (entity.isSynced) 1L else 0L,
            )
        }
    }

    /** @inheritDoc */
    override suspend fun update(entity: Goal) {
        withContext(Dispatchers.IO) {
            queries.update(
                name = entity.name,
                target_amount = entity.targetAmount.amount,
                current_amount = entity.currentAmount.amount,
                currency = entity.currency.code,
                target_date = entity.targetDate?.toString(),
                status = entity.status.name,
                icon = entity.icon,
                color = entity.color,
                account_id = entity.accountId?.value,
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
    override suspend fun getUnsynced(householdId: SyncId): List<Goal> =
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

    // ── GoalRepository ──────────────────────────────────────────────

    /** @inheritDoc */
    override fun observeActive(householdId: SyncId): Flow<List<Goal>> =
        queries.selectActive(householdId.value)
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.map { it.toDomain() } }

    /** @inheritDoc */
    override suspend fun updateProgress(id: SyncId, currentAmount: Cents) {
        val now = Clock.System.now().toString()
        withContext(Dispatchers.IO) {
            queries.updateProgress(
                current_amount = currentAmount.amount,
                updated_at = now,
                id = id.value,
            )
        }
    }

    // ── Mapping ─────────────────────────────────────────────────────

    /**
     * Maps a SQLDelight-generated [GoalRow] to the domain [Goal] model.
     */
    private fun GoalRow.toDomain(): Goal = Goal(
        id = SyncId(id),
        householdId = SyncId(household_id),
        name = name,
        targetAmount = Cents(target_amount),
        currentAmount = Cents(current_amount),
        currency = Currency(currency),
        targetDate = target_date?.let { LocalDate.parse(it) },
        status = GoalStatus.valueOf(status),
        icon = icon,
        color = color,
        accountId = account_id?.let { SyncId(it) },
        createdAt = Instant.parse(created_at),
        updatedAt = Instant.parse(updated_at),
        deletedAt = deleted_at?.let { Instant.parse(it) },
        syncVersion = sync_version,
        isSynced = is_synced != 0L,
    )
}
