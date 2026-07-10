// SPDX-License-Identifier: BUSL-1.1

package com.finance.core

import com.finance.core.budget.BudgetCalculator
import com.finance.core.budget.BudgetHealth
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.datetime.*
import kotlin.test.*

/**
 * Tests for budget creation and utilization tracking (#1359).
 *
 * Verifies budget construction, utilization calculation from matching
 * transactions, period boundary handling, over-budget detection,
 * isRollover field, and zero-amount edge cases.
 */
class BudgetUtilizationTrackingTest {

    @BeforeTest
    fun setup() {
        TestFixtures.reset()
    }

    // ═══════════════════════════════════════════════════════════════════
    // Budget Creation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun createBudgetWithCategoryAmountPeriod() {
        val budget = TestFixtures.createBudget(
            categoryId = SyncId("groceries"),
            name = "Grocery Budget",
            amount = Cents(60000L), // $600
            period = BudgetPeriod.MONTHLY,
        )
        assertEquals(SyncId("groceries"), budget.categoryId)
        assertEquals("Grocery Budget", budget.name)
        assertEquals(Cents(60000L), budget.amount)
        assertEquals(BudgetPeriod.MONTHLY, budget.period)
    }

    @Test
    fun rejectBlankBudgetName() {
        assertFailsWith<IllegalArgumentException> {
            TestFixtures.createBudget(name = "")
        }
    }

    @Test
    fun rejectZeroBudgetAmount() {
        assertFailsWith<IllegalArgumentException> {
            TestFixtures.createBudget(amount = Cents.ZERO)
        }
    }

    @Test
    fun rejectNegativeBudgetAmount() {
        assertFailsWith<IllegalArgumentException> {
            TestFixtures.createBudget(amount = Cents(-100L))
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Budget Utilization from Transactions
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun utilizationFromMatchingExpenses() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000L),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(10000L),
                date = LocalDate(2024, 6, 5),
            ),
            TestFixtures.createExpense(
                amount = Cents(15000L),
                date = LocalDate(2024, 6, 15),
            ),
        )

        val status = BudgetCalculator.calculateStatus(
            budget, transactions, LocalDate(2024, 6, 15),
        )

        assertEquals(Cents(25000L), status.spent)
        assertEquals(Cents(25000L), status.remaining)
        assertEquals(0.5, status.utilization)
        assertFalse(status.isOverBudget)
        assertEquals(BudgetHealth.HEALTHY, status.healthLevel)
    }

    @Test
    fun utilizationIgnoresDeletedTransactions() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000L),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(20000L),
                date = LocalDate(2024, 6, 10),
            ),
            TestFixtures.createExpense(
                amount = Cents(30000L),
                date = LocalDate(2024, 6, 12),
                deletedAt = Instant.parse("2024-06-13T00:00:00Z"),
            ),
        )

        val status = BudgetCalculator.calculateStatus(
            budget, transactions, LocalDate(2024, 6, 15),
        )

        assertEquals(Cents(20000L), status.spent)
        assertFalse(status.isOverBudget)
    }

    @Test
    fun utilizationIgnoresIncomeTransactions() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000L),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(10000L),
                date = LocalDate(2024, 6, 10),
            ),
            TestFixtures.createIncome(
                amount = Cents(100000L),
                date = LocalDate(2024, 6, 15),
            ),
        )

        val status = BudgetCalculator.calculateStatus(
            budget, transactions, LocalDate(2024, 6, 15),
        )

        // Only expenses count toward utilization
        assertEquals(Cents(10000L), status.spent)
    }

    @Test
    fun utilizationIgnoresOutOfPeriodTransactions() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000L),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(10000L),
                date = LocalDate(2024, 6, 15),
            ),
            // This is May — outside June period
            TestFixtures.createExpense(
                amount = Cents(20000L),
                date = LocalDate(2024, 5, 28),
            ),
            // This is July — also outside
            TestFixtures.createExpense(
                amount = Cents(15000L),
                date = LocalDate(2024, 7, 1),
            ),
        )

        val status = BudgetCalculator.calculateStatus(
            budget, transactions, LocalDate(2024, 6, 15),
        )

        assertEquals(Cents(10000L), status.spent)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Over-Budget Detection
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun overBudgetWhenSpentExceedsAmount() {
        val budget = TestFixtures.createBudget(
            amount = Cents(30000L), // $300
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(20000L),
                date = LocalDate(2024, 6, 5),
            ),
            TestFixtures.createExpense(
                amount = Cents(15000L),
                date = LocalDate(2024, 6, 15),
            ),
        )

        val status = BudgetCalculator.calculateStatus(
            budget, transactions, LocalDate(2024, 6, 15),
        )

        assertTrue(status.isOverBudget)
        assertEquals(Cents(35000L), status.spent) // $350 > $300
        assertTrue(status.remaining.isNegative())
        assertEquals(BudgetHealth.OVER, status.healthLevel)
    }

    @Test
    fun exactlyAtBudgetIsNotOver() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000L),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(50000L),
                date = LocalDate(2024, 6, 15),
            ),
        )

        val status = BudgetCalculator.calculateStatus(
            budget, transactions, LocalDate(2024, 6, 15),
        )

        assertFalse(status.isOverBudget)
        assertTrue(status.remaining.isZero())
        assertEquals(1.0, status.utilization)
    }

    @Test
    fun warningLevelBetween75And100Percent() {
        val budget = TestFixtures.createBudget(
            amount = Cents(100000L), // $1,000
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(80000L), // 80%
                date = LocalDate(2024, 6, 15),
            ),
        )

        val status = BudgetCalculator.calculateStatus(
            budget, transactions, LocalDate(2024, 6, 15),
        )

        assertEquals(BudgetHealth.WARNING, status.healthLevel)
        assertFalse(status.isOverBudget)
    }

    @Test
    fun healthyBelow75Percent() {
        val budget = TestFixtures.createBudget(
            amount = Cents(100000L),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(50000L), // 50%
                date = LocalDate(2024, 6, 15),
            ),
        )

        val status = BudgetCalculator.calculateStatus(
            budget, transactions, LocalDate(2024, 6, 15),
        )

        assertEquals(BudgetHealth.HEALTHY, status.healthLevel)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Budget Period Boundaries
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun monthlyPeriodBoundaries() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.MONTHLY,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 15),
        )
        assertEquals(LocalDate(2024, 6, 1), period.start)
        assertEquals(LocalDate(2024, 6, 30), period.end)
        assertEquals(30, period.daysTotal)
    }

    @Test
    fun weeklyPeriodBoundaries() {
        // #3595: weekly periods anchor on the budget startDate (Sat June 1, 2024),
        // not the calendar Monday. June 15 is exactly two 7-day periods later,
        // so the active week is June 15-21.
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.WEEKLY,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 15),
        )
        assertEquals(LocalDate(2024, 6, 15), period.start)
        assertEquals(LocalDate(2024, 6, 21), period.end)
        assertEquals(7, period.daysTotal)
    }

    @Test
    fun yearlyPeriodBoundaries() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.YEARLY,
            LocalDate(2024, 1, 1),
            LocalDate(2024, 6, 15),
        )
        assertEquals(LocalDate(2024, 1, 1), period.start)
        assertEquals(LocalDate(2024, 12, 31), period.end)
        assertEquals(366, period.daysTotal) // 2024 is leap year
    }

    @Test
    fun quarterlyPeriodBoundariesQ2() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.QUARTERLY,
            LocalDate(2024, 1, 1),
            LocalDate(2024, 6, 15),
        )
        assertEquals(LocalDate(2024, 4, 1), period.start)
        assertEquals(LocalDate(2024, 6, 30), period.end)
    }

    @Test
    fun biweeklyPeriodBoundaries() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.BIWEEKLY,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 10),
        )
        // 10 days from June 1, period index = 10/14 = 0
        assertEquals(LocalDate(2024, 6, 1), period.start)
        assertEquals(LocalDate(2024, 6, 14), period.end)
        assertEquals(14, period.daysTotal)
    }

    @Test
    fun periodContainsDate() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.MONTHLY,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 15),
        )
        assertTrue(period.contains(LocalDate(2024, 6, 1)))
        assertTrue(period.contains(LocalDate(2024, 6, 30)))
        assertTrue(period.contains(LocalDate(2024, 6, 15)))
        assertFalse(period.contains(LocalDate(2024, 5, 31)))
        assertFalse(period.contains(LocalDate(2024, 7, 1)))
    }

    @Test
    fun daysRemainingInPeriod() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.MONTHLY,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 15),
        )
        // 15 days remaining from June 15 to June 30 (inclusive): 16 days
        val remaining = period.daysRemaining(LocalDate(2024, 6, 15))
        assertEquals(16, remaining)
    }

    @Test
    fun daysRemainingOnLastDay() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.MONTHLY,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 30),
        )
        assertEquals(1, period.daysRemaining(LocalDate(2024, 6, 30)))
    }

    @Test
    fun daysRemainingAfterPeriodEndsIsZero() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.MONTHLY,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 15),
        )
        assertEquals(0, period.daysRemaining(LocalDate(2024, 7, 5)))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Multiple Budgets for Same Category
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun multipleBudgetsSameCategoryDifferentPeriods() {
        val weeklyBudget = TestFixtures.createBudget(
            categoryId = SyncId("dining"),
            name = "Dining Weekly",
            amount = Cents(10000L),
            period = BudgetPeriod.WEEKLY,
        )
        val monthlyBudget = TestFixtures.createBudget(
            categoryId = SyncId("dining"),
            name = "Dining Monthly",
            amount = Cents(40000L),
            period = BudgetPeriod.MONTHLY,
        )

        // Same category, different budgets
        assertEquals(weeklyBudget.categoryId, monthlyBudget.categoryId)
        assertNotEquals(weeklyBudget.period, monthlyBudget.period)
        assertNotEquals(weeklyBudget.amount, monthlyBudget.amount)
    }

    // ═══════════════════════════════════════════════════════════════════
    // isRollover Field
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun defaultIsRolloverIsFalse() {
        val budget = TestFixtures.createBudget()
        assertFalse(budget.isRollover)
    }

    @Test
    fun isRolloverCanBeEnabled() {
        val budget = TestFixtures.createBudget().copy(isRollover = true)
        assertTrue(budget.isRollover)
    }

    @Test
    fun rolloverAlgorithm_surplusCarriedForward() {
        val baseBudget = Cents(50000L) // $500
        val spent = Cents(30000L)       // $300

        val unused = baseBudget - spent  // $200
        val carryForward = if (unused.amount > 0L) unused else Cents.ZERO
        val nextPeriodBudget = baseBudget + carryForward

        assertEquals(Cents(70000L), nextPeriodBudget) // $700
    }

    @Test
    fun rolloverAlgorithm_overBudgetNoCarryForward() {
        val baseBudget = Cents(50000L) // $500
        val spent = Cents(60000L)       // $600 (over)

        val unused = baseBudget - spent  // -$100
        val carryForward = if (unused.amount > 0L) unused else Cents.ZERO
        val nextPeriodBudget = baseBudget + carryForward

        // Over-budget: no surplus carried forward
        assertEquals(Cents(50000L), nextPeriodBudget)
    }

    @Test
    fun rolloverAlgorithm_exactSpendNoCarryForward() {
        val baseBudget = Cents(50000L)
        val spent = Cents(50000L)

        val unused = baseBudget - spent
        val carryForward = if (unused.amount > 0L) unused else Cents.ZERO
        val nextPeriodBudget = baseBudget + carryForward

        assertEquals(Cents(50000L), nextPeriodBudget)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Daily Budget Rate
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun dailyBudgetRateWithDaysRemaining() {
        val budget = TestFixtures.createBudget(amount = Cents(30000L))
        val spent = Cents(10000L)
        val daysRemaining = 10

        val dailyRate = BudgetCalculator.dailyBudgetRate(budget, spent, daysRemaining)
        // ($300 - $100) / 10 = $20/day = 2000 cents
        assertEquals(Cents(2000L), dailyRate)
    }

    @Test
    fun dailyBudgetRateZeroDaysRemaining() {
        val budget = TestFixtures.createBudget(amount = Cents(30000L))
        val dailyRate = BudgetCalculator.dailyBudgetRate(budget, Cents.ZERO, 0)
        assertEquals(Cents.ZERO, dailyRate)
    }

    @Test
    fun dailyBudgetRateWhenOverBudget() {
        val budget = TestFixtures.createBudget(amount = Cents(30000L))
        val spent = Cents(40000L) // over budget
        val dailyRate = BudgetCalculator.dailyBudgetRate(budget, spent, 10)
        assertEquals(Cents.ZERO, dailyRate)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Edge Cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun noTransactionsInPeriod() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000L),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )

        val status = BudgetCalculator.calculateStatus(
            budget, emptyList(), LocalDate(2024, 6, 15),
        )

        assertEquals(Cents.ZERO, status.spent)
        assertEquals(Cents(50000L), status.remaining)
        assertEquals(0.0, status.utilization)
        assertFalse(status.isOverBudget)
        assertEquals(BudgetHealth.HEALTHY, status.healthLevel)
    }

    @Test
    fun singleCentBudget() {
        val budget = TestFixtures.createBudget(
            amount = Cents(1L),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(1L),
                date = LocalDate(2024, 6, 15),
            ),
        )

        val status = BudgetCalculator.calculateStatus(
            budget, transactions, LocalDate(2024, 6, 15),
        )

        assertEquals(Cents(1L), status.spent)
        assertTrue(status.remaining.isZero())
        assertFalse(status.isOverBudget)
    }

    @Test
    fun leapYearFebruaryMonthlyPeriod() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.MONTHLY,
            LocalDate(2024, 2, 1),
            LocalDate(2024, 2, 15),
        )
        assertEquals(LocalDate(2024, 2, 1), period.start)
        assertEquals(LocalDate(2024, 2, 29), period.end) // leap year
        assertEquals(29, period.daysTotal)
    }

    @Test
    fun nonLeapYearFebruaryMonthlyPeriod() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.MONTHLY,
            LocalDate(2023, 2, 1),
            LocalDate(2023, 2, 15),
        )
        assertEquals(LocalDate(2023, 2, 1), period.start)
        assertEquals(LocalDate(2023, 2, 28), period.end)
        assertEquals(28, period.daysTotal)
    }

    @Test
    fun allBudgetPeriodsExist() {
        val periods = BudgetPeriod.entries
        assertEquals(5, periods.size)
        assertTrue(periods.contains(BudgetPeriod.WEEKLY))
        assertTrue(periods.contains(BudgetPeriod.BIWEEKLY))
        assertTrue(periods.contains(BudgetPeriod.MONTHLY))
        assertTrue(periods.contains(BudgetPeriod.QUARTERLY))
        assertTrue(periods.contains(BudgetPeriod.YEARLY))
    }
}
