// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.aggregation

import com.finance.core.TestFixtures
import com.finance.models.TransactionStatus
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Tests for [FinancialAggregator.incomeByCategory] (#3742).
 */
class FinancialAggregatorIncomeByCategoryTest {

    private val from = LocalDate(2024, 6, 1)
    private val to = LocalDate(2024, 6, 30)

    private val salary = SyncId("cat-salary")
    private val interest = SyncId("cat-interest")

    @Test
    fun groupsIncomeByCategory() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(300000), date = LocalDate(2024, 6, 1), categoryId = salary),
            TestFixtures.createIncome(amount = Cents(200000), date = LocalDate(2024, 6, 15), categoryId = salary),
            TestFixtures.createIncome(amount = Cents(1500), date = LocalDate(2024, 6, 20), categoryId = interest),
        )

        val result = FinancialAggregator.incomeByCategory(transactions, from, to)

        assertEquals(Cents(500000), result[salary])
        assertEquals(Cents(1500), result[interest])
        assertEquals(2, result.size)
    }

    @Test
    fun uncategorisedIncome_usesNullKey() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(4200), date = LocalDate(2024, 6, 10), categoryId = null),
        )

        val result = FinancialAggregator.incomeByCategory(transactions, from, to)

        assertEquals(Cents(4200), result[null])
    }

    @Test
    fun excludesExpensesVoidedAndDeleted() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(100000), date = LocalDate(2024, 6, 5), categoryId = salary),
            // Expense should never count as income.
            TestFixtures.createExpense(amount = Cents(50000), date = LocalDate(2024, 6, 6), categoryId = salary),
            // Voided income excluded.
            TestFixtures.createIncome(
                amount = Cents(99999),
                date = LocalDate(2024, 6, 7),
                categoryId = salary,
                status = TransactionStatus.VOID,
            ),
            // Soft-deleted income excluded.
            TestFixtures.createIncome(
                amount = Cents(88888),
                date = LocalDate(2024, 6, 8),
                categoryId = salary,
                deletedAt = Instant.parse("2024-06-09T00:00:00Z"),
            ),
        )

        val result = FinancialAggregator.incomeByCategory(transactions, from, to)

        assertEquals(Cents(100000), result[salary])
        assertEquals(1, result.size)
    }

    @Test
    fun respectsDateRange() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(100000), date = LocalDate(2024, 5, 31), categoryId = salary),
            TestFixtures.createIncome(amount = Cents(200000), date = LocalDate(2024, 6, 15), categoryId = salary),
            TestFixtures.createIncome(amount = Cents(300000), date = LocalDate(2024, 7, 1), categoryId = salary),
        )

        val result = FinancialAggregator.incomeByCategory(transactions, from, to)

        assertEquals(Cents(200000), result[salary])
        assertEquals(1, result.size)
    }

    @Test
    fun emptyInput_returnsEmptyMap() {
        assertTrue(FinancialAggregator.incomeByCategory(emptyList(), from, to).isEmpty())
    }

    @Test
    fun allAmountsNonNegative() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(1000), date = LocalDate(2024, 6, 2), categoryId = salary),
        )
        val result = FinancialAggregator.incomeByCategory(transactions, from, to)
        assertNull(result[interest])
        assertTrue(result.values.all { it.amount >= 0L })
    }
}
