// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository.mock

import com.finance.android.data.repository.BudgetRepository
import com.finance.android.ui.data.SampleData
import com.finance.models.Budget
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/**
 * In-memory [BudgetRepository] backed by [SampleData].
 *
 * Supports basic CRUD by mutating an internal list and re-emitting the [Flow].
 * Intended for development, previews, and testing until a real database layer
 * (e.g. SQLDelight) is wired up.
 */
class MockBudgetRepository : BudgetRepository {

    private val _budgets = MutableStateFlow(SampleData.budgets.toList())

    override fun observeAll(householdId: SyncId): Flow<List<Budget>> =
        _budgets.map { list ->
            list.filter { it.householdId == householdId && it.deletedAt == null }
        }

    override fun observeById(id: SyncId): Flow<Budget?> =
        _budgets.map { list -> list.find { it.id == id && it.deletedAt == null } }

    override suspend fun getById(id: SyncId): Budget? =
        _budgets.value.find { it.id == id && it.deletedAt == null }

    override fun observeActive(householdId: SyncId): Flow<List<Budget>> =
        _budgets.map { list ->
            val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
            list.filter { budget ->
                val end = budget.endDate
                budget.householdId == householdId &&
                    budget.deletedAt == null &&
                    (end == null || end >= today)
            }
        }

    override fun observeByCategory(categoryId: SyncId): Flow<List<Budget>> =
        _budgets.map { list ->
            list.filter { it.categoryId == categoryId && it.deletedAt == null }
        }

    override suspend fun insert(budget: Budget) {
        _budgets.update { it + budget }
    }

    override suspend fun update(budget: Budget) {
        _budgets.update { list ->
            list.map { if (it.id == budget.id) budget else it }
        }
    }

    override suspend fun delete(id: SyncId) {
        val now = Clock.System.now()
        _budgets.update { list ->
            list.map { budget ->
                if (budget.id == id) budget.copy(
                    deletedAt = now,
                    updatedAt = now,
                    isSynced = false,
                ) else budget
            }
        }
    }

    override suspend fun getUnsynced(householdId: SyncId): List<Budget> =
        _budgets.value.filter { it.householdId == householdId && !it.isSynced }

    override suspend fun markSynced(ids: List<SyncId>) {
        _budgets.update { list ->
            list.map { budget ->
                if (budget.id in ids) budget.copy(isSynced = true) else budget
            }
        }
    }
}
