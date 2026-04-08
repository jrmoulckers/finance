// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.repository.impl

import com.finance.desktop.data.repository.BudgetRepository
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.coroutines.flow.*
import kotlinx.datetime.*

class InMemoryBudgetRepository : BudgetRepository {
    private val store = MutableStateFlow(createSampleBudgets())
    override fun observeAll(householdId: SyncId) = store.map { it.filter { b -> b.deletedAt == null } }
    override fun observeActive(householdId: SyncId) = observeAll(householdId)
    override suspend fun insert(entity: Budget) { store.update { it + entity } }
    override suspend fun delete(id: SyncId) { val now = Clock.System.now(); store.update { l -> l.map { if (it.id == id) it.copy(deletedAt = now) else it } } }
}

private fun createSampleBudgets(): List<Budget> {
    val now = Clock.System.now(); val hid = SyncId("d1")
    val today = now.toLocalDateTime(TimeZone.currentSystemDefault()).date
    val monthStart = LocalDate(today.year, today.month, 1)
    return listOf(
        Budget(SyncId("b1"), hid, SyncId("c1"), "Groceries", Cents(60000), Currency.USD, BudgetPeriod.MONTHLY, monthStart, createdAt = now, updatedAt = now),
        Budget(SyncId("b2"), hid, SyncId("c2"), "Dining", Cents(30000), Currency.USD, BudgetPeriod.MONTHLY, monthStart, createdAt = now, updatedAt = now),
    )
}
