// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.budget

import com.finance.core.TestFixtures
import com.finance.models.BudgetPeriod
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Correctness tests for budget status filtering (category + currency),
 * biweekly period bucketing before the anchor date, and spend forecasting.
 */
class BudgetCalculatorAccuracyTest {

    // ── calculateStatus filters by budget category ───────────────────

    @Test
    fun calculateStatus_countsOnlyMatchingCategory() {
        val budget = TestFixtures.createBudget(
            categoryId = SyncId("groceries"),
            amount = Cents(50000),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = listOf(
            TestFixtures.createTransaction(
                type = TransactionType.EXPENSE,
                amount = Cents(10000),
                date = LocalDate(2024, 6, 10),
                categoryId = SyncId("groceries"),
            ),
            // Different category — must be excluded.
            TestFixtures.createTransaction(
                type = TransactionType.EXPENSE,
                amount = Cents(30000),
                date = LocalDate(2024, 6, 12),
                categoryId = SyncId("dining"),
            ),
        )

        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))

        assertEquals(Cents(10000), status.spent)
    }

    @Test
    fun calculateStatus_mixedListMatchesPreFilteredList() {
        val budget = TestFixtures.createBudget(
            categoryId = SyncId("groceries"),
            startDate = LocalDate(2024, 6, 1),
        )
        val groceries = TestFixtures.createTransaction(
            type = TransactionType.EXPENSE,
            amount = Cents(12000),
            date = LocalDate(2024, 6, 10),
            categoryId = SyncId("groceries"),
        )
        val other = TestFixtures.createTransaction(
            type = TransactionType.EXPENSE,
            amount = Cents(8000),
            date = LocalDate(2024, 6, 11),
            categoryId = SyncId("dining"),
        )

        val mixed = BudgetCalculator.calculateStatus(budget, listOf(groceries, other), LocalDate(2024, 6, 15))
        val preFiltered = BudgetCalculator.calculateStatus(budget, listOf(groceries), LocalDate(2024, 6, 15))

        assertEquals(preFiltered.spent, mixed.spent)
    }

    // ── calculateStatus filters by budget currency ───────────────────

    @Test
    fun calculateStatus_countsOnlyMatchingCurrency() {
        val budget = TestFixtures.createBudget(
            categoryId = SyncId("travel"),
            currency = Currency.USD,
            amount = Cents(50000),
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = listOf(
            TestFixtures.createTransaction(
                type = TransactionType.EXPENSE,
                amount = Cents(10000),
                date = LocalDate(2024, 6, 10),
                categoryId = SyncId("travel"),
                currency = Currency.USD,
            ),
            // Same category, different currency — must be excluded, not summed as raw cents.
            TestFixtures.createTransaction(
                type = TransactionType.EXPENSE,
                amount = Cents(40000),
                date = LocalDate(2024, 6, 12),
                categoryId = SyncId("travel"),
                currency = Currency.EUR,
            ),
        )

        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))

        assertEquals(Cents(10000), status.spent)
        assertFalse(status.isOverBudget)
    }

    // ── BIWEEKLY buckets dates before the anchor correctly ───────────

    @Test
    fun getCurrentPeriod_biweekly_oneDayBeforeStart() {
        val start = LocalDate(2024, 1, 1)
        val ref = LocalDate(2023, 12, 31)
        val period = BudgetCalculator.getCurrentPeriod(BudgetPeriod.BIWEEKLY, start, ref)

        assertTrue(period.contains(ref))
        assertEquals(LocalDate(2023, 12, 18), period.start)
        assertEquals(LocalDate(2023, 12, 31), period.end)
    }

    @Test
    fun getCurrentPeriod_biweekly_exactlyOnePeriodBeforeStart() {
        val start = LocalDate(2024, 1, 1)
        val ref = LocalDate(2023, 12, 18)
        val period = BudgetCalculator.getCurrentPeriod(BudgetPeriod.BIWEEKLY, start, ref)

        assertTrue(period.contains(ref))
        assertEquals(LocalDate(2023, 12, 18), period.start)
        assertEquals(LocalDate(2023, 12, 31), period.end)
    }

    @Test
    fun getCurrentPeriod_biweekly_severalPeriodsBeforeStart() {
        val start = LocalDate(2024, 1, 1)
        val ref = LocalDate(2023, 12, 17) // 15 days before -> two periods back
        val period = BudgetCalculator.getCurrentPeriod(BudgetPeriod.BIWEEKLY, start, ref)

        assertTrue(period.contains(ref))
        assertEquals(LocalDate(2023, 12, 4), period.start)
        assertEquals(LocalDate(2023, 12, 17), period.end)
    }

    @Test
    fun getCurrentPeriod_biweekly_onOrAfterStart_unchanged() {
        val start = LocalDate(2024, 1, 1)
        val period = BudgetCalculator.getCurrentPeriod(BudgetPeriod.BIWEEKLY, start, LocalDate(2024, 1, 20))
        assertEquals(LocalDate(2024, 1, 15), period.start)
        assertEquals(LocalDate(2024, 1, 28), period.end)
    }

    // ── forecast() ───────────────────────────────────────────────────

    private fun grocerBudget() = TestFixtures.createBudget(
        categoryId = SyncId("groceries"),
        amount = Cents(50000), // $500 monthly
        period = BudgetPeriod.MONTHLY,
        startDate = LocalDate(2024, 6, 1),
    )

    private fun grocerExpense(amount: Cents, date: LocalDate) = TestFixtures.createTransaction(
        type = TransactionType.EXPENSE,
        amount = amount,
        date = date,
        categoryId = SyncId("groceries"),
    )

    @Test
    fun forecast_onTrack() {
        // $250 spent by day 15 of a 30-day month -> projected $500 == budget.
        val txns = listOf(
            grocerExpense(Cents(10000), LocalDate(2024, 6, 5)),
            grocerExpense(Cents(15000), LocalDate(2024, 6, 15)),
        )
        val f = BudgetCalculator.forecast(grocerBudget(), txns, LocalDate(2024, 6, 15))

        assertEquals(15, f.daysElapsed)
        assertEquals(15, f.daysRemaining)
        assertEquals(Cents(25000), f.spent)
        assertEquals(Cents(50000), f.projectedSpend)
        assertEquals(Cents(0), f.projectedRemaining)
        assertFalse(f.isProjectedOverBudget)
    }

    @Test
    fun forecast_projectedOver() {
        // $150 by day 5 -> run rate 3000/day -> projected 90000 >> 50000.
        val txns = listOf(grocerExpense(Cents(15000), LocalDate(2024, 6, 3)))
        val f = BudgetCalculator.forecast(grocerBudget(), txns, LocalDate(2024, 6, 5))

        assertEquals(5, f.daysElapsed)
        assertEquals(Cents(90000), f.projectedSpend)
        assertTrue(f.projectedRemaining.isNegative())
        assertTrue(f.isProjectedOverBudget)
    }

    @Test
    fun forecast_atPeriodEnd_projectionEqualsActual() {
        val txns = listOf(grocerExpense(Cents(40000), LocalDate(2024, 6, 20)))
        val f = BudgetCalculator.forecast(grocerBudget(), txns, LocalDate(2024, 6, 30))

        assertEquals(30, f.daysElapsed)
        assertEquals(0, f.daysRemaining)
        assertEquals(f.spent, f.projectedSpend) // no extrapolation on the last day
        assertFalse(f.isProjectedOverBudget)
    }

    @Test
    fun forecast_zeroSpend() {
        val f = BudgetCalculator.forecast(grocerBudget(), emptyList(), LocalDate(2024, 6, 15))

        assertEquals(Cents(0), f.spent)
        assertEquals(Cents(0), f.projectedSpend)
        assertEquals(Cents(50000), f.projectedRemaining)
        assertFalse(f.isProjectedOverBudget)
    }
}
