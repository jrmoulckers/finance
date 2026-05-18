// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.repository.impl.sqldelight

import com.finance.db.FinanceDatabase
import com.finance.desktop.data.repository.GoalRepository
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
 * SQLDelight-backed implementation of [GoalRepository].
 */
class SqlDelightGoalRepository(
    private val database: FinanceDatabase,
) : GoalRepository {

    private val queries get() = database.goalQueries

    private val _cache = MutableStateFlow<List<Goal>>(emptyList())

    init {
        refreshCache()
    }

    override fun observeAll(householdId: SyncId): Flow<List<Goal>> =
        _cache.map { list ->
            list.filter { it.householdId == householdId && it.deletedAt == null }
        }

    override fun observeActive(householdId: SyncId): Flow<List<Goal>> =
        _cache.map { list ->
            list.filter {
                it.householdId == householdId &&
                    it.status == GoalStatus.ACTIVE &&
                    it.deletedAt == null
            }
        }

    override suspend fun updateProgress(id: SyncId, currentAmount: Cents) =
        withContext(Dispatchers.IO) {
            val now = Clock.System.now()
            queries.updateProgress(
                current_amount = currentAmount.amount,
                updated_at = now.toString(),
                id = id.value,
            )
            refreshCache()
        }

    override suspend fun insert(entity: Goal) = withContext(Dispatchers.IO) {
        queries.insert(
            id = entity.id.value,
            household_id = entity.householdId.value,
            owner_id = entity.ownerId.value,
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
        refreshCache()
    }

    override suspend fun update(entity: Goal) = withContext(Dispatchers.IO) {
        val now = Clock.System.now()
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
            _cache.value = rows.map { it.toGoal() }
        } catch (_: Exception) {
            // Database may not be initialized yet
        }
    }
}

internal fun com.finance.db.Goal.toGoal(): Goal = Goal(
    id = SyncId(id),
    householdId = SyncId(household_id),
    ownerId = SyncId(owner_id),
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
