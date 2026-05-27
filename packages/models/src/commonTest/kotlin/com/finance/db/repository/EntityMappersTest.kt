// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.repository

import com.finance.db.repository.impl.EntityMappers
import com.finance.models.AccountType
import com.finance.models.BudgetPeriod
import com.finance.models.GoalStatus
import com.finance.models.LiabilityInstallmentStatus
import com.finance.models.LiabilityStatus
import com.finance.models.LiabilityType
import com.finance.models.TransactionStatus
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class EntityMappersTest {

    @Test
    fun mapAccount_mapsAllFields() {
        val account = EntityMappers.mapAccount(
            "acc-1", "hh-1", "user-1", "Savings", "SAVINGS", "EUR", 250000L,
            0L, 2L, "icon", "#00FF00", "2025-01-01T00:00:00Z", "2025-01-15T12:00:00Z",
            null, 3L, 1L,
        )
        assertEquals("acc-1", account.id.value)
        assertEquals(AccountType.SAVINGS, account.type)
        assertEquals(Currency.EUR, account.currency)
        assertEquals(Cents(250000L), account.currentBalance)
        assertFalse(account.isArchived)
        assertTrue(account.isSynced)
    }

    @Test
    fun mapAccount_handlesArchivedAndDeletedAt() {
        val account = EntityMappers.mapAccount(
            "acc-2", "hh-1", "user-1", "Old", "CHECKING", "USD", 0L, 1L, 0L,
            null, null, "2025-01-01T00:00:00Z", "2025-01-15T12:00:00Z",
            "2025-01-10T08:30:00Z", 1L, 0L,
        )
        assertTrue(account.isArchived)
        assertFalse(account.isSynced)
        assertEquals("2025-01-10T08:30:00Z", account.deletedAt.toString())
    }

    @Test
    fun mapTransaction_mapsAllFields() {
        val txn = EntityMappers.mapTransaction(
            "txn-1", "hh-1", "user-1", "acc-1", "cat-1", "EXPENSE", "CLEARED",
            -5000L, "USD", "Store", "note", "2025-01-15", null, null,
            0L, null, "[\"food\",\"weekly\"]",
            "2025-01-15T10:00:00Z", "2025-01-15T10:00:00Z", null, 0L, 0L,
        )
        assertEquals(TransactionType.EXPENSE, txn.type)
        assertEquals(Cents(-5000L), txn.amount)
        assertEquals(listOf("food", "weekly"), txn.tags)
        assertFalse(txn.isRecurring)
    }

    @Test
    fun mapTransaction_handlesTransferFields() {
        val txn = EntityMappers.mapTransaction(
            "txn-2", "hh-1", "user-1", "acc-1", null, "TRANSFER", "PENDING",
            -10000L, "USD", null, null, "2025-01-15", "acc-2", "txn-3",
            1L, "rule-1", "[]",
            "2025-01-15T10:00:00Z", "2025-01-15T10:00:00Z", null, 0L, 0L,
        )
        assertEquals(TransactionType.TRANSFER, txn.type)
        assertEquals("acc-2", txn.transferAccountId?.value)
        assertTrue(txn.isRecurring)
    }

    @Test
    fun mapLiability_mapsAllFields() {
        val liability = EntityMappers.mapLiability(
            "lia-1", "hh-1", "user-1", "BNPL", "ACTIVE", "Klarna", "Store",
            12000L, 9000L, "USD", "2025-01-01", null, "acc-1", "note",
            "2025-01-01T00:00:00Z", "2025-01-15T12:00:00Z", null, 2L, 0L,
        )
        assertEquals(LiabilityType.BNPL, liability.type)
        assertEquals(LiabilityStatus.ACTIVE, liability.status)
        assertEquals(Cents(9000L), liability.remainingBalance)
        assertEquals("acc-1", liability.accountId?.value)
    }

    @Test
    fun mapLiabilityInstallment_mapsPaidFields() {
        val installment = EntityMappers.mapLiabilityInstallment(
            "lin-1", "lia-1", "hh-1", "user-1", 2L, "2025-02-01", 3000L,
            "USD", "PAID", "2025-02-01T08:00:00Z", "txn-1",
            "2025-01-01T00:00:00Z", "2025-02-01T08:00:00Z", null, 3L, 1L,
        )
        assertEquals(LiabilityInstallmentStatus.PAID, installment.status)
        assertEquals(2, installment.sequenceNumber)
        assertEquals("txn-1", installment.paymentTransactionId?.value)
        assertTrue(installment.isSynced)
    }

    @Test
    fun mapBudget_mapsAllFields() {
        val budget = EntityMappers.mapBudget(
            "bgt-1", "hh-1", "user-1", "cat-1", "Groceries", 30000L, "USD",
            "MONTHLY", "2025-01-01", "2025-12-31", 1L,
            "2025-01-01T00:00:00Z", "2025-01-15T12:00:00Z", null, 2L, 1L,
        )
        assertEquals(Cents(30000L), budget.amount)
        assertEquals(BudgetPeriod.MONTHLY, budget.period)
        assertTrue(budget.isRollover)
    }

    @Test
    fun mapBudget_handlesNullEndDate() {
        val budget = EntityMappers.mapBudget(
            "bgt-2", "hh-1", "user-1", "cat-1", "Fun", 10000L, "EUR",
            "WEEKLY", "2025-01-06", null, 0L,
            "2025-01-01T00:00:00Z", "2025-01-15T12:00:00Z", null, 0L, 0L,
        )
        assertNull(budget.endDate)
        assertFalse(budget.isRollover)
    }

    @Test
    fun mapGoal_mapsAllFields() {
        val goal = EntityMappers.mapGoal(
            "goal-1", "hh-1", "user-1", "Vacation", 500000L, 125000L, "USD",
            "2025-06-15", "ACTIVE", "icon", "#0088FF", "acc-sav",
            "2025-01-01T00:00:00Z", "2025-01-15T12:00:00Z", null, 1L, 0L,
        )
        assertEquals(GoalStatus.ACTIVE, goal.status)
        assertEquals(0.25, goal.progress)
        assertFalse(goal.isComplete)
    }

    @Test
    fun mapGoal_handlesCompletedStatus() {
        val goal = EntityMappers.mapGoal(
            "goal-2", "hh-1", "user-1", "Car", 200000L, 200000L, "USD",
            null, "COMPLETED", null, null, null,
            "2025-01-01T00:00:00Z", "2025-01-15T12:00:00Z", null, 5L, 1L,
        )
        assertTrue(goal.isComplete)
        assertEquals(1.0, goal.progress)
    }

    @Test
    fun mapCategory_mapsAllFields() {
        val cat = EntityMappers.mapCategory(
            "cat-1", "hh-1", "user-1", "Food", "icon", "#FF0000", null,
            0L, 1L, 5L, 1L, "2025-01-01T00:00:00Z", "2025-01-15T12:00:00Z", null, 0L, 1L,
        )
        assertFalse(cat.isIncome)
        assertTrue(cat.isSystem)
        assertEquals(5, cat.sortOrder)
        assertTrue(cat.isBiometricProtected)
    }

    @Test
    fun mapCategory_handlesSubcategory() {
        val cat = EntityMappers.mapCategory(
            "cat-2", "hh-1", "user-1", "Restaurants", null, null, "cat-1",
            0L, 0L, 0L, 0L, "2025-01-01T00:00:00Z", "2025-01-15T12:00:00Z", null, 0L, 0L,
        )
        assertEquals("cat-1", cat.parentId?.value)
    }

    @Test
    fun serializeTags_emptyList() = assertEquals("[]", EntityMappers.serializeTags(emptyList()))

    @Test
    fun serializeTags_multipleTags() {
        assertEquals("[\"a\",\"b\"]", EntityMappers.serializeTags(listOf("a", "b")))
    }

    @Test
    fun serializeTags_roundTrip() {
        val original = listOf("tag1", "tag2")
        val serialized = EntityMappers.serializeTags(original)
        val txn = EntityMappers.mapTransaction(
            "t", "h", "o", "a", null, "EXPENSE", "CLEARED", -100L, "USD",
            null, null, "2025-01-15", null, null, 0L, null, serialized,
            "2025-01-01T00:00:00Z", "2025-01-01T00:00:00Z", null, 0L, 0L,
        )
        assertEquals(original, txn.tags)
    }
}
