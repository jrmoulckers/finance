// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.impl

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import app.cash.sqldelight.coroutines.mapToOneOrNull
import com.finance.android.data.repository.BudgetRepository
import com.finance.db.Budget as BudgetRow
import com.finance.db.FinanceDatabase
import com.finance.models.Budget
import com.finance.models.BudgetPeriod
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
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/**
 * SQLDelight-backed implementation of [BudgetRepository].
 *
 * Delegates all persistence to the [FinanceDatabase] and maps between
 * SQLDelight-generated row types and domain [Budget] models.
 */
class SqlDelightBudgetRepository(
    private val database: FinanceDatabase,
) : BudgetRepository {

    private val queries get() = database.budgetQueries

    // ── BaseRepository ──────────────────────────────────────────────

    /** @inheritDoc */
    override fun observeAll(householdId: SyncId): Flow<List<Budget>> =
        queries.selectByHousehold(householdId.value)
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.map { it.toDomain() } }

    /** @inheritDoc */
    override fun observeById(id: SyncId): Flow<Budget?> =
        queries.selectById(id.value)
            .asFlow()
            .mapToOneOrNull(Dispatchers.IO)
            .map { it?.toDomain() }

    /** @inheritDoc */
    override suspend fun getById(id: SyncId): Budget? = withContext(Dispatchers.IO) {
        queries.selectById(id.value).executeAsOneOrNull()?.toDomain()
    }

    /** @inheritDoc */
    override suspend fun insert(entity: Budget) {
        withContext(Dispatchers.IO) {
            queries.insert(
                id = entity.id.value,
                household_id = entity.householdId.value,
                category_id = entity.categoryId.value,
                name = entity.name,
                amount = entity.amount.amount,
                currency = entity.currency.code,
                period = entity.period.name,
                start_date = entity.startDate.toString(),
                end_date = entity.endDate?.toString(),
                is_rollover = if (entity.isRollover) 1L else 0L,
                created_at = entity.createdAt.toString(),
                updated_at = entity.updatedAt.toString(),
                sync_version = entity.syncVersion,
                is_synced = if (entity.isSynced) 1L else 0L,
            )
        }
    }

    /** @inheritDoc */
    override suspend fun update(entity: Budget) {
        withContext(Dispatchers.IO) {
            queries.update(
                category_id = entity.categoryId.value,
                name = entity.name,
                amount = entity.amount.amount,
                currency = entity.currency.code,
                period = entity.period.name,
                start_date = entity.startDate.toString(),
                end_date = entity.endDate?.toString(),
                is_rollover = if (entity.isRollover) 1L else 0L,
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
    override suspend fun getUnsynced(householdId: SyncId): List<Budget> =
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

    // ── BudgetRepository ────────────────────────────────────────────

    /** @inheritDoc */
    override fun observeByCategory(categoryId: SyncId): Flow<List<Budget>> =
        queries.selectByCategory(categoryId.value)
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.map { it.toDomain() } }

    /** @inheritDoc */
    override fun observeActive(householdId: SyncId): Flow<List<Budget>> {
        val today = Clock.System.now()
            .toLocalDateTime(TimeZone.currentSystemDefault()).date.toString()
        return queries.selectActive(household_id = householdId.value, end_date = today)
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.map { it.toDomain() } }
    }

    // ── Mapping ─────────────────────────────────────────────────────

    /**
     * Maps a SQLDelight-generated [BudgetRow] to the domain [Budget] model.
     */
    private fun BudgetRow.toDomain(): Budget = Budget(
        id = SyncId(id),
        householdId = SyncId(household_id),
        categoryId = SyncId(category_id),
        name = name,
        amount = Cents(amount),
        currency = Currency(currency),
        period = BudgetPeriod.valueOf(period),
        startDate = LocalDate.parse(start_date),
        endDate = end_date?.let { LocalDate.parse(it) },
        isRollover = is_rollover != 0L,
        createdAt = Instant.parse(created_at),
        updatedAt = Instant.parse(updated_at),
        deletedAt = deleted_at?.let { Instant.parse(it) },
        syncVersion = sync_version,
        isSynced = is_synced != 0L,
    )
}
