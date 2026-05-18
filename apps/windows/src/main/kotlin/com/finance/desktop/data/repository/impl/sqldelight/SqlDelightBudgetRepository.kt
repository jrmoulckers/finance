// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.repository.impl.sqldelight

import com.finance.db.FinanceDatabase
import com.finance.desktop.data.repository.BudgetRepository
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
 * SQLDelight-backed implementation of [BudgetRepository].
 */
class SqlDelightBudgetRepository(
    private val database: FinanceDatabase,
) : BudgetRepository {

    private val queries get() = database.budgetQueries

    private val _cache = MutableStateFlow<List<Budget>>(emptyList())

    init {
        refreshCache()
    }

    override fun observeAll(householdId: SyncId): Flow<List<Budget>> =
        _cache.map { list ->
            list.filter { it.householdId == householdId && it.deletedAt == null }
        }

    override fun observeActive(householdId: SyncId): Flow<List<Budget>> =
        _cache.map { list ->
            list.filter { it.householdId == householdId && it.deletedAt == null }
        }

    override suspend fun insert(entity: Budget) = withContext(Dispatchers.IO) {
        queries.insert(
            id = entity.id.value,
            household_id = entity.householdId.value,
            owner_id = entity.ownerId.value,
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
        refreshCache()
    }

    override suspend fun update(entity: Budget) = withContext(Dispatchers.IO) {
        val now = Clock.System.now()
        queries.update(
            category_id = entity.categoryId.value,
            name = entity.name,
            amount = entity.amount.amount,
            currency = entity.currency.code,
            period = entity.period.name,
            start_date = entity.startDate.toString(),
            end_date = entity.endDate?.toString(),
            is_rollover = if (entity.isRollover) 1L else 0L,
            updated_at = now.toString(),
            sync_version = entity.syncVersion + 1,
            is_synced = 0L,
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

    private fun refreshCache() {
        try {
            val rows = queries.selectAll().executeAsList()
            _cache.value = rows.map { it.toBudget() }
        } catch (_: Exception) {
            // Database may not be initialized yet
        }
    }
}

internal fun com.finance.db.Budget.toBudget(): Budget = Budget(
    id = SyncId(id),
    householdId = SyncId(household_id),
    ownerId = SyncId(owner_id),
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
