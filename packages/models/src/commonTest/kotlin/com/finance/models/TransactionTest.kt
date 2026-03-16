// SPDX-License-Identifier: BUSL-1.1

package com.finance.models

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Tests for [Transaction] data class — construction rules, defaults, and invariants.
 */
class TransactionTest {

    // ── Test helpers ─────────────────────────────────────────────────────

    private val now = Instant.parse("2024-01-15T12:00:00Z")
    private val today = LocalDate.parse("2024-01-15")
    private val householdId = SyncId("household-1")
    private val accountId = SyncId("account-1")
    private val categoryId = SyncId("category-1")

    private fun expense(
        amount: Cents = Cents(1500L),
        status: TransactionStatus = TransactionStatus.CLEARED,
        payee: String? = null,
        note: String? = null,
        categoryId: SyncId? = this.categoryId,
        deletedAt: Instant? = null,
        syncVersion: Long = 0,
        isSynced: Boolean = false,
        tags: List<String> = emptyList(),
    ) = Transaction(
        id = SyncId("txn-1"),
        householdId = householdId,
        accountId = accountId,
        categoryId = categoryId,
        type = TransactionType.EXPENSE,
        status = status,
        amount = amount,
        currency = Currency.USD,
        payee = payee,
        note = note,
        date = today,
        createdAt = now,
        updatedAt = now,
        deletedAt = deletedAt,
        syncVersion = syncVersion,
        isSynced = isSynced,
        tags = tags,
    )

    // ── Valid construction ───────────────────────────────────────────────

    @Test
    fun createExpenseTransaction() {
        val txn = expense()
        assertEquals(TransactionType.EXPENSE, txn.type)
        assertEquals(Cents(1500L), txn.amount)
        assertEquals(Currency.USD, txn.currency)
    }

    @Test
    fun createIncomeTransaction() {
        val txn = Transaction(
            id = SyncId("txn-2"),
            householdId = householdId,
            accountId = accountId,
            type = TransactionType.INCOME,
            amount = Cents(500000L),
            currency = Currency.USD,
            date = today,
            createdAt = now,
            updatedAt = now,
        )
        assertEquals(TransactionType.INCOME, txn.type)
        assertEquals(Cents(500000L), txn.amount)
    }

    @Test
    fun createTransferWithDestinationAccount() {
        val txn = Transaction(
            id = SyncId("txn-3"),
            householdId = householdId,
            accountId = accountId,
            type = TransactionType.TRANSFER,
            amount = Cents(10000L),
            currency = Currency.USD,
            date = today,
            transferAccountId = SyncId("account-2"),
            createdAt = now,
            updatedAt = now,
        )
        assertEquals(TransactionType.TRANSFER, txn.type)
        assertEquals(SyncId("account-2"), txn.transferAccountId)
    }

    // ── Invalid construction ────────────────────────────────────────────

    @Test
    fun rejectZeroAmount() {
        assertFailsWith<IllegalArgumentException> {
            expense(amount = Cents.ZERO)
        }
    }

    @Test
    fun rejectTransferWithoutDestinationAccount() {
        assertFailsWith<IllegalArgumentException> {
            Transaction(
                id = SyncId("txn-4"),
                householdId = householdId,
                accountId = accountId,
                type = TransactionType.TRANSFER,
                amount = Cents(1000L),
                currency = Currency.USD,
                date = today,
                transferAccountId = null,
                createdAt = now,
                updatedAt = now,
            )
        }
    }

    // ── Default values ──────────────────────────────────────────────────

    @Test
    fun defaultStatusIsCleared() {
        val txn = expense()
        assertEquals(TransactionStatus.CLEARED, txn.status)
    }

    @Test
    fun defaultSyncVersionIsZero() {
        val txn = expense()
        assertEquals(0L, txn.syncVersion)
    }

    @Test
    fun defaultIsSyncedIsFalse() {
        val txn = expense()
        assertFalse(txn.isSynced)
    }

    @Test
    fun defaultDeletedAtIsNull() {
        val txn = expense()
        assertNull(txn.deletedAt)
    }

    @Test
    fun defaultCategoryIdIsNull() {
        val txn = Transaction(
            id = SyncId("txn-5"),
            householdId = householdId,
            accountId = accountId,
            type = TransactionType.EXPENSE,
            amount = Cents(100L),
            currency = Currency.USD,
            date = today,
            createdAt = now,
            updatedAt = now,
        )
        assertNull(txn.categoryId)
    }

    @Test
    fun defaultTagsIsEmpty() {
        val txn = expense()
        assertTrue(txn.tags.isEmpty())
    }

    @Test
    fun defaultIsRecurringIsFalse() {
        val txn = expense()
        assertFalse(txn.isRecurring)
    }

    @Test
    fun defaultTransferFieldsAreNull() {
        val txn = expense()
        assertNull(txn.transferAccountId)
        assertNull(txn.transferTransactionId)
    }

    // ── Sync metadata ───────────────────────────────────────────────────

    @Test
    fun syncVersionCanBeSet() {
        val txn = expense(syncVersion = 42L)
        assertEquals(42L, txn.syncVersion)
    }

    @Test
    fun isSyncedCanBeSet() {
        val txn = expense(isSynced = true)
        assertTrue(txn.isSynced)
    }

    @Test
    fun copyToMarkAsSynced() {
        val txn = expense()
        val synced = txn.copy(isSynced = true, syncVersion = 1L)
        assertTrue(synced.isSynced)
        assertEquals(1L, synced.syncVersion)
        // Original unchanged (immutable data class)
        assertFalse(txn.isSynced)
    }

    // ── Soft delete ─────────────────────────────────────────────────────

    @Test
    fun softDeleteSetsDeletedAt() {
        val deletedTime = Instant.parse("2024-06-01T00:00:00Z")
        val txn = expense(deletedAt = deletedTime)
        assertEquals(deletedTime, txn.deletedAt)
    }

    // ── Transaction statuses ────────────────────────────────────────────

    @Test
    fun allTransactionStatusesExist() {
        val statuses = TransactionStatus.entries
        assertEquals(4, statuses.size)
        assertTrue(statuses.contains(TransactionStatus.PENDING))
        assertTrue(statuses.contains(TransactionStatus.CLEARED))
        assertTrue(statuses.contains(TransactionStatus.RECONCILED))
        assertTrue(statuses.contains(TransactionStatus.VOID))
    }

    @Test
    fun allTransactionTypesExist() {
        val types = TransactionType.entries
        assertEquals(3, types.size)
        assertTrue(types.contains(TransactionType.EXPENSE))
        assertTrue(types.contains(TransactionType.INCOME))
        assertTrue(types.contains(TransactionType.TRANSFER))
    }

    // ── Optional fields ─────────────────────────────────────────────────

    @Test
    fun payeeCanBeSet() {
        val txn = expense(payee = "Grocery Store")
        assertEquals("Grocery Store", txn.payee)
    }

    @Test
    fun noteCanBeSet() {
        val txn = expense(note = "Weekly groceries")
        assertEquals("Weekly groceries", txn.note)
    }

    @Test
    fun tagsCanBeSet() {
        val txn = expense(tags = listOf("food", "essentials"))
        assertEquals(listOf("food", "essentials"), txn.tags)
    }

    // ── Negative amounts ────────────────────────────────────────────────

    @Test
    fun negativeAmountIsAllowed() {
        val txn = expense(amount = Cents(-500L))
        assertEquals(Cents(-500L), txn.amount)
    }

    // ── Equality / copy ─────────────────────────────────────────────────

    @Test
    fun equalityByFields() {
        val txn1 = expense()
        val txn2 = expense()
        assertEquals(txn1, txn2)
    }

    @Test
    fun copyPreservesUnchangedFields() {
        val txn = expense(payee = "Acme")
        val updated = txn.copy(status = TransactionStatus.RECONCILED)
        assertEquals("Acme", updated.payee)
        assertEquals(TransactionStatus.RECONCILED, updated.status)
    }
}
