// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.repository.impl

import com.finance.desktop.data.repository.TransactionRepository
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.coroutines.flow.*
import kotlinx.datetime.*

class InMemoryTransactionRepository : TransactionRepository {
    private val store = MutableStateFlow(createSampleTransactions())
    override fun observeAll(householdId: SyncId) = store.map { it.filter { t -> t.deletedAt == null } }
    override fun observeById(id: SyncId) = store.map { it.find { t -> t.id == id } }
    override fun observeByAccount(accountId: SyncId) = store.map { it.filter { t -> t.accountId == accountId && t.deletedAt == null } }
    override fun observeByDateRange(householdId: SyncId, start: LocalDate, end: LocalDate) = store.map { it.filter { t -> t.date >= start && t.date <= end && t.deletedAt == null } }
    override suspend fun insert(entity: Transaction) { store.update { it + entity } }
    override suspend fun delete(id: SyncId) { val now = Clock.System.now(); store.update { l -> l.map { if (it.id == id) it.copy(deletedAt = now) else it } } }
}

private fun createSampleTransactions(): List<Transaction> {
    val now = Clock.System.now(); val hid = SyncId("d1")
    val today = now.toLocalDateTime(TimeZone.currentSystemDefault()).date
    return listOf(
        Transaction(SyncId("t1"), hid, SyncId("a1"), null, TransactionType.EXPENSE, TransactionStatus.CLEARED, Cents(5230), Currency.USD, payee = "Whole Foods", date = today, createdAt = now, updatedAt = now),
        Transaction(SyncId("t2"), hid, SyncId("a1"), null, TransactionType.INCOME, TransactionStatus.CLEARED, Cents(420000), Currency.USD, payee = "Salary", date = today, createdAt = now, updatedAt = now),
        Transaction(SyncId("t3"), hid, SyncId("a3"), null, TransactionType.EXPENSE, TransactionStatus.CLEARED, Cents(1599), Currency.USD, payee = "Netflix", date = today.minus(1, DateTimeUnit.DAY), createdAt = now, updatedAt = now),
    )
}
