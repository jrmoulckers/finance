// SPDX-License-Identifier: BUSL-1.1

package com.finance.models

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Tests for [Account] data class — construction rules, defaults, and account types.
 */
class AccountTest {

    // ── Test helpers ─────────────────────────────────────────────────────

    private val now = Instant.parse("2024-01-15T12:00:00Z")
    private val householdId = SyncId("household-1")

    private fun checking(
        name: String = "Main Checking",
        balance: Cents = Cents(100000L),
        isArchived: Boolean = false,
        deletedAt: Instant? = null,
        syncVersion: Long = 0,
        isSynced: Boolean = false,
    ) = Account(
        id = SyncId("account-1"),
        householdId = householdId,
        name = name,
        type = AccountType.CHECKING,
        currency = Currency.USD,
        currentBalance = balance,
        isArchived = isArchived,
        createdAt = now,
        updatedAt = now,
        deletedAt = deletedAt,
        syncVersion = syncVersion,
        isSynced = isSynced,
    )

    // ── Valid construction ───────────────────────────────────────────────

    @Test
    fun createCheckingAccount() {
        val account = checking()
        assertEquals("Main Checking", account.name)
        assertEquals(AccountType.CHECKING, account.type)
        assertEquals(Cents(100000L), account.currentBalance)
    }

    @Test
    fun createSavingsAccount() {
        val account = Account(
            id = SyncId("account-2"),
            householdId = householdId,
            name = "Emergency Fund",
            type = AccountType.SAVINGS,
            currency = Currency.USD,
            currentBalance = Cents(5000000L),
            createdAt = now,
            updatedAt = now,
        )
        assertEquals(AccountType.SAVINGS, account.type)
    }

    @Test
    fun createCreditCardAccount() {
        val account = Account(
            id = SyncId("account-3"),
            householdId = householdId,
            name = "Visa Platinum",
            type = AccountType.CREDIT_CARD,
            currency = Currency.USD,
            currentBalance = Cents(-250000L), // credit card debt is negative
            createdAt = now,
            updatedAt = now,
        )
        assertEquals(AccountType.CREDIT_CARD, account.type)
        assertTrue(account.currentBalance.isNegative())
    }

    // ── Invalid construction ────────────────────────────────────────────

    @Test
    fun rejectBlankName() {
        assertFailsWith<IllegalArgumentException> {
            checking(name = "")
        }
    }

    @Test
    fun rejectWhitespaceOnlyName() {
        assertFailsWith<IllegalArgumentException> {
            checking(name = "   ")
        }
    }

    // ── Default values ──────────────────────────────────────────────────

    @Test
    fun defaultIsArchivedIsFalse() {
        val account = checking()
        assertFalse(account.isArchived)
    }

    @Test
    fun defaultSortOrderIsZero() {
        val account = checking()
        assertEquals(0, account.sortOrder)
    }

    @Test
    fun defaultIconIsNull() {
        val account = checking()
        assertNull(account.icon)
    }

    @Test
    fun defaultColorIsNull() {
        val account = checking()
        assertNull(account.color)
    }

    @Test
    fun defaultDeletedAtIsNull() {
        val account = checking()
        assertNull(account.deletedAt)
    }

    @Test
    fun defaultSyncVersionIsZero() {
        val account = checking()
        assertEquals(0L, account.syncVersion)
    }

    @Test
    fun defaultIsSyncedIsFalse() {
        val account = checking()
        assertFalse(account.isSynced)
    }

    // ── Archive flag ────────────────────────────────────────────────────

    @Test
    fun archiveAccount() {
        val account = checking(isArchived = true)
        assertTrue(account.isArchived)
    }

    @Test
    fun archiveViaCopy() {
        val account = checking()
        val archived = account.copy(isArchived = true)
        assertTrue(archived.isArchived)
        assertFalse(account.isArchived) // original immutable
    }

    // ── Balance operations ──────────────────────────────────────────────

    @Test
    fun zeroBalance() {
        val account = checking(balance = Cents.ZERO)
        assertTrue(account.currentBalance.isZero())
    }

    @Test
    fun negativeBalance() {
        val account = checking(balance = Cents(-50000L))
        assertTrue(account.currentBalance.isNegative())
    }

    @Test
    fun updateBalanceViaCopy() {
        val account = checking(balance = Cents(100000L))
        val deposit = Cents(25000L)
        val updated = account.copy(
            currentBalance = account.currentBalance + deposit
        )
        assertEquals(Cents(125000L), updated.currentBalance)
    }

    @Test
    fun subtractFromBalanceViaCopy() {
        val account = checking(balance = Cents(100000L))
        val withdrawal = Cents(30000L)
        val updated = account.copy(
            currentBalance = account.currentBalance - withdrawal
        )
        assertEquals(Cents(70000L), updated.currentBalance)
    }

    // ── Account types ───────────────────────────────────────────────────

    @Test
    fun allAccountTypesExist() {
        val types = AccountType.entries
        assertEquals(7, types.size)
        assertTrue(types.contains(AccountType.CHECKING))
        assertTrue(types.contains(AccountType.SAVINGS))
        assertTrue(types.contains(AccountType.CREDIT_CARD))
        assertTrue(types.contains(AccountType.CASH))
        assertTrue(types.contains(AccountType.INVESTMENT))
        assertTrue(types.contains(AccountType.LOAN))
        assertTrue(types.contains(AccountType.OTHER))
    }

    // ── Sync metadata ───────────────────────────────────────────────────

    @Test
    fun syncVersionCanBeSet() {
        val account = checking(syncVersion = 5L)
        assertEquals(5L, account.syncVersion)
    }

    @Test
    fun markAsSynced() {
        val account = checking()
        val synced = account.copy(isSynced = true, syncVersion = 1L)
        assertTrue(synced.isSynced)
        assertEquals(1L, synced.syncVersion)
    }

    // ── Soft delete ─────────────────────────────────────────────────────

    @Test
    fun softDeleteSetsDeletedAt() {
        val deletedTime = Instant.parse("2024-06-01T00:00:00Z")
        val account = checking(deletedAt = deletedTime)
        assertEquals(deletedTime, account.deletedAt)
    }

    // ── Equality ────────────────────────────────────────────────────────

    @Test
    fun equalityByFields() {
        val a1 = checking()
        val a2 = checking()
        assertEquals(a1, a2)
    }
}
