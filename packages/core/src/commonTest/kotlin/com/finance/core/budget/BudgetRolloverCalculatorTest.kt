// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.budget

import com.finance.core.TestFixtures
import com.finance.models.BudgetPeriod
import com.finance.models.types.Cents
import kotlinx.datetime.LocalDate
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals

class BudgetRolloverCalculatorTest {

    @BeforeTest
    fun setup() {
        TestFixtures.reset()
    }

    // ═══════════════════════════════════════════════════════════════════
    // calculateRollover() — single period rollover
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun rollover_zeroSpending_fullBudgetCarriesForward() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000), // $500
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 1, 1),
            isRollover = true,
        )
        // No transactions in June
        val result = BudgetRolloverCalculator.calculateRollover(
            budget = budget,
            transactions = emptyList(),
            periodDate = LocalDate(2024, 6, 15),
        )

        assertEquals(Cents(50000), result.rolloverAmount, "Full budget should carry forward")
        assertEquals(Cents.ZERO, result.spentAmount, "No spending recorded")
        assertEquals(Cents(50000), result.baseAmount)
    }

    @Test
    fun rollover_partialSpending_surplusCarriesForward() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000), // $500
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 1, 1),
            isRollover = true,
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(30000), date = LocalDate(2024, 6, 10)),
        )
        val result = BudgetRolloverCalculator.calculateRollover(
            budget = budget,
            transactions = transactions,
            periodDate = LocalDate(2024, 6, 15),
        )

        assertEquals(Cents(20000), result.rolloverAmount, "$200 surplus should carry forward")
        assertEquals(Cents(30000), result.spentAmount)
    }

    @Test
    fun rollover_exactBudget_zeroCarryForward() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 1, 1),
            isRollover = true,
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(50000), date = LocalDate(2024, 6, 10)),
        )
        val result = BudgetRolloverCalculator.calculateRollover(
            budget = budget,
            transactions = transactions,
            periodDate = LocalDate(2024, 6, 15),
        )

        assertEquals(Cents.ZERO, result.rolloverAmount, "No surplus or deficit")
    }

    @Test
    fun rollover_overspending_negativeCarryForward() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 1, 1),
            isRollover = true,
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(70000), date = LocalDate(2024, 6, 10)),
        )
        val result = BudgetRolloverCalculator.calculateRollover(
            budget = budget,
            transactions = transactions,
            periodDate = LocalDate(2024, 6, 15),
        )

        assertEquals(Cents(-20000), result.rolloverAmount, "$200 overspend should carry as negative")
    }

    // ═══════════════════════════════════════════════════════════════════
    // calculateEffectiveBudget() — effective budget with rollover
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun effectiveBudget_rolloverDisabled_equalsBaseAmount() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 1, 1),
            isRollover = false,
        )

        val result = BudgetRolloverCalculator.calculateEffectiveBudget(
            budget = budget,
            currentPeriodTransactions = emptyList(),
            previousPeriodTransactions = emptyList(),
            referenceDate = LocalDate(2024, 7, 15),
        )

        assertEquals(Cents(50000), result.effectiveAmount)
        assertEquals(Cents.ZERO, result.rolloverCarry)
    }

    @Test
    fun effectiveBudget_withSurplus_increasesEffective() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000), // $500 base
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 1, 1),
            isRollover = true,
        )
        // June: spent $300, surplus $200
        val previousTransactions = listOf(
            TestFixtures.createExpense(amount = Cents(30000), date = LocalDate(2024, 6, 15)),
        )

        val result = BudgetRolloverCalculator.calculateEffectiveBudget(
            budget = budget,
            currentPeriodTransactions = emptyList(),
            previousPeriodTransactions = previousTransactions,
            referenceDate = LocalDate(2024, 7, 15), // July
        )

        assertEquals(Cents(20000), result.rolloverCarry, "$200 surplus carried")
        assertEquals(Cents(70000), result.effectiveAmount, "$500 base + $200 rollover = $700")
    }

    @Test
    fun effectiveBudget_withOverspend_reducesEffective() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000), // $500 base
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 1, 1),
            isRollover = true,
        )
        // June: spent $700, overspent by $200
        val previousTransactions = listOf(
            TestFixtures.createExpense(amount = Cents(70000), date = LocalDate(2024, 6, 15)),
        )

        val result = BudgetRolloverCalculator.calculateEffectiveBudget(
            budget = budget,
            currentPeriodTransactions = emptyList(),
            previousPeriodTransactions = previousTransactions,
            referenceDate = LocalDate(2024, 7, 15),
        )

        assertEquals(Cents(-20000), result.rolloverCarry, "$200 overspend carried as negative")
        assertEquals(Cents(30000), result.effectiveAmount, "$500 base - $200 overspend = $300")
    }

    @Test
    fun effectiveBudget_previousPeriodEmpty_fullSurplus() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 1, 1),
            isRollover = true,
        )

        val result = BudgetRolloverCalculator.calculateEffectiveBudget(
            budget = budget,
            currentPeriodTransactions = emptyList(),
            previousPeriodTransactions = emptyList(),
            referenceDate = LocalDate(2024, 7, 15),
        )

        assertEquals(Cents(50000), result.rolloverCarry, "Full prior budget is surplus")
        assertEquals(Cents(100000), result.effectiveAmount, "$500 + $500 = $1000")
    }

    // ═══════════════════════════════════════════════════════════════════
    // calculateCumulativeRollover() — multi-period chain
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun cumulativeRollover_rolloverDisabled_returnsZero() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 1, 1),
            isRollover = false,
        )

        val cumulative = BudgetRolloverCalculator.calculateCumulativeRollover(
            budget = budget,
            transactionsByPeriod = emptyMap(),
            referenceDate = LocalDate(2024, 3, 15),
        )

        assertEquals(Cents.ZERO, cumulative)
    }

    @Test
    fun cumulativeRollover_twoMonthsSurplus_accumulates() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000), // $500/month
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 1, 1),
            isRollover = true,
        )

        // Jan: spent $400 -> surplus $100
        // Feb: effective $600, spent $300 -> surplus $300
        // March is the target
        val transactionsByPeriod = mapOf(
            LocalDate(2024, 1, 1) to listOf(
                TestFixtures.createExpense(amount = Cents(40000), date = LocalDate(2024, 1, 15)),
            ),
            LocalDate(2024, 2, 1) to listOf(
                TestFixtures.createExpense(amount = Cents(30000), date = LocalDate(2024, 2, 15)),
            ),
        )

        val cumulative = BudgetRolloverCalculator.calculateCumulativeRollover(
            budget = budget,
            transactionsByPeriod = transactionsByPeriod,
            referenceDate = LocalDate(2024, 3, 15),
        )

        // Jan: effective = $500, spent = $400, rollover = $100
        // Feb: effective = $500 + $100 = $600, spent = $300, rollover = $300
        assertEquals(Cents(30000), cumulative, "$300 cumulative rollover into March")
    }

    @Test
    fun cumulativeRollover_overspendReducesFuture() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000), // $500/month
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 1, 1),
            isRollover = true,
        )

        // Jan: spent $700 -> overspend $200
        // Feb: effective $500 + (-$200) = $300, spent $100 -> surplus $200
        // March target
        val transactionsByPeriod = mapOf(
            LocalDate(2024, 1, 1) to listOf(
                TestFixtures.createExpense(amount = Cents(70000), date = LocalDate(2024, 1, 15)),
            ),
            LocalDate(2024, 2, 1) to listOf(
                TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 2, 15)),
            ),
        )

        val cumulative = BudgetRolloverCalculator.calculateCumulativeRollover(
            budget = budget,
            transactionsByPeriod = transactionsByPeriod,
            referenceDate = LocalDate(2024, 3, 15),
        )

        // Jan: eff = $500, spent = $700, rollover = -$200
        // Feb: eff = $500 + (-$200) = $300, spent = $100, rollover = $200
        assertEquals(Cents(20000), cumulative, "$200 cumulative rollover into March")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Edge cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun rollover_deletedTransactionsExcluded() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 1, 1),
            isRollover = true,
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(30000), date = LocalDate(2024, 6, 10)),
            TestFixtures.createExpense(
                amount = Cents(10000),
                date = LocalDate(2024, 6, 12),
                deletedAt = TestFixtures.fixedInstant,
            ),
        )
        val result = BudgetRolloverCalculator.calculateRollover(
            budget = budget,
            transactions = transactions,
            periodDate = LocalDate(2024, 6, 15),
        )

        assertEquals(Cents(20000), result.rolloverAmount, "Deleted txn should not count")
    }

    @Test
    fun rollover_incomeTransactionsExcluded() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 1, 1),
            isRollover = true,
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(30000), date = LocalDate(2024, 6, 10)),
            TestFixtures.createIncome(amount = Cents(20000), date = LocalDate(2024, 6, 15)),
        )
        val result = BudgetRolloverCalculator.calculateRollover(
            budget = budget,
            transactions = transactions,
            periodDate = LocalDate(2024, 6, 15),
        )

        assertEquals(Cents(20000), result.rolloverAmount, "Income should not reduce rollover surplus")
    }

    @Test
    fun rollover_outOfPeriodTransactionsExcluded() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 1, 1),
            isRollover = true,
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(30000), date = LocalDate(2024, 6, 10)),
            // This expense is in July, outside the June period
            TestFixtures.createExpense(amount = Cents(20000), date = LocalDate(2024, 7, 5)),
        )
        val result = BudgetRolloverCalculator.calculateRollover(
            budget = budget,
            transactions = transactions,
            periodDate = LocalDate(2024, 6, 15),
        )

        assertEquals(Cents(20000), result.rolloverAmount, "July expense should not affect June rollover")
    }

    @Test
    fun rollover_weeklyPeriod_calculatesCorrectly() {
        val budget = TestFixtures.createBudget(
            amount = Cents(10000), // $100/week
            period = BudgetPeriod.WEEKLY,
            startDate = LocalDate(2024, 7, 1), // Monday
            isRollover = true,
        )
        val transactions = listOf(
            // Spend $60 in the week of July 1
            TestFixtures.createExpense(amount = Cents(6000), date = LocalDate(2024, 7, 3)),
        )
        val result = BudgetRolloverCalculator.calculateRollover(
            budget = budget,
            transactions = transactions,
            periodDate = LocalDate(2024, 7, 3),
        )

        assertEquals(Cents(4000), result.rolloverAmount, "$40 surplus for weekly budget")
    }
}
