// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.repository.impl

import com.finance.desktop.data.repository.AccountRepository
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.coroutines.flow.*
import kotlinx.datetime.Clock

class InMemoryAccountRepository : AccountRepository {
    private val store = MutableStateFlow(createSampleAccounts())
    override fun observeAll(householdId: SyncId) = store.map { it.filter { a -> a.deletedAt == null } }
    override fun observeById(id: SyncId) = store.map { it.find { a -> a.id == id } }
    override suspend fun getById(id: SyncId) = store.value.find { it.id == id }
    override suspend fun insert(entity: Account) { store.update { it + entity } }
    override suspend fun update(entity: Account) { store.update { l -> l.map { if (it.id == entity.id) entity else it } } }
    override suspend fun delete(id: SyncId) { val now = Clock.System.now(); store.update { l -> l.map { if (it.id == id) it.copy(deletedAt = now) else it } } }
    override fun observeActive(householdId: SyncId) = store.map { it.filter { a -> a.deletedAt == null && !a.isArchived } }
    override suspend fun updateBalance(id: SyncId, newBalance: Cents) { val now = Clock.System.now(); store.update { l -> l.map { if (it.id == id) it.copy(currentBalance = newBalance, updatedAt = now) else it } } }
}

private fun createSampleAccounts(): List<Account> {
    val now = Clock.System.now(); val hid = SyncId("d1")
    return listOf(
        Account(SyncId("a1"), hid, "Checking", AccountType.CHECKING, Currency.USD, Cents(524730), sortOrder = 0, createdAt = now, updatedAt = now),
        Account(SyncId("a2"), hid, "Savings", AccountType.SAVINGS, Currency.USD, Cents(1867000), sortOrder = 1, createdAt = now, updatedAt = now),
        Account(SyncId("a3"), hid, "Visa Card", AccountType.CREDIT_CARD, Currency.USD, Cents(128450), sortOrder = 2, createdAt = now, updatedAt = now),
    )
}
