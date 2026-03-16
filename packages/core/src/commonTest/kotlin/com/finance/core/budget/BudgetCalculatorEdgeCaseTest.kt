// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.budget

import com.finance.core.TestFixtures
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.datetime.*
import kotlin.test.*

/**
 * Edge case tests for [BudgetCalculator] covering period boundary
 * calculations, zero-budget behavior, and daily rate edge cases.
 */
class BudgetCalculatorEdgeCaseTest {

    // ═══════════════════════════════════════════════════════════════════
    // calculateStatus() — zero-budget edge case
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun calculateStatus_zeroBudgetAmount_throwsAtConstruction() {
        // Budget model requires positive amount — cannot construct a zero budget
        assertFailsWith<IllegalArgumentException> {
            TestFixtures.createBudget(amount = Cents(0))
        }
    }

    @Test
    fun calculateStatus_negativeBudgetAmount_throwsAtConstruction() {
        assertFailsWith<IllegalArgumentException> {
            TestFixtures.createBudget(amount = Cents(-100))
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // calculateStatus() — utilization at exact 100%
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun calculateStatus_exactly100percent_isWarningNotOver() {
        val budget = TestFixtures.createBudget(
            amount = Cents(10000), // $100
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 6, 15)),
        )
        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))

        assertEquals(1.0, status.utilization, 1e-10)
        assertFalse(status.isOverBudget, "Exactly at budget should not be 'over'")
        assertEquals(Cents(0), status.remaining)
        assertEquals(BudgetHealth.WARNING, status.healthLevel)
    }

    @Test
    fun calculateStatus_onecentOverBudget() {
        val budget = TestFixtures.createBudget(
            amount = Cents(10000),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(10001), date = LocalDate(2024, 6, 15)),
        )
        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))

        assertTrue(status.isOverBudget)
        assertTrue(status.utilization > 1.0)
        assertTrue(status.remaining.isNegative())
        assertEquals(BudgetHealth.OVER, status.healthLevel)
    }

    // ═══════════════════════════════════════════════════════════════════
    // calculateStatus() — future start date
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun calculateStatus_futureStartDate_noTransactionsInPeriod() {
        // Budget starts July 1, but we're checking in June.
        // Monthly period calculation uses referenceDate's month,
        // so the June period is June 1–30 regardless.
        val budget = TestFixtures.createBudget(
            amount = Cents(50000),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 7, 1),
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 6, 15)),
        )
        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))

        // June period transactions are included
        assertEquals(Cents(1000), status.spent)
    }

    // ═══════════════════════════════════════════════════════════════════
    // calculateStatus() — transfer transactions excluded
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun calculateStatus_transferTransactions_excluded() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 6, 10)),
            TestFixtures.createTransaction(
                type = TransactionType.TRANSFER,
                amount = Cents(20000),
                date = LocalDate(2024, 6, 12),
                accountId = SyncId("account-1"),
                transferAccountId = SyncId("account-2"),
            ),
        )
        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))

        // Only the expense counts, not the transfer
        assertEquals(Cents(10000), status.spent)
    }

    // ═══════════════════════════════════════════════════════════════════
    // calculateStatus() — multiple small expenses
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun calculateStatus_manySmallExpenses() {
        val budget = TestFixtures.createBudget(
            amount = Cents(10000),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )
        // 100 transactions of 1 cent each
        val transactions = (1..100).map { day ->
            TestFixtures.createExpense(
                amount = Cents(1),
                date = LocalDate(2024, 6, (day % 28) + 1),
            )
        }
        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))

        assertEquals(Cents(100), status.spent)
        assertEquals(Cents(9900), status.remaining)
    }

    // ═══════════════════════════════════════════════════════════════════
    // getCurrentPeriod() — WEEKLY on Sunday
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun getCurrentPeriod_weekly_onSunday() {
        // 2024-06-16 is a Sunday
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.WEEKLY,
            LocalDate(2024, 1, 1),
            LocalDate(2024, 6, 16),
        )
        // Week should be Mon June 10 – Sun June 16
        assertEquals(LocalDate(2024, 6, 10), period.start)
        assertEquals(LocalDate(2024, 6, 16), period.end)
        assertEquals(7, period.daysTotal)
    }

    @Test
    fun getCurrentPeriod_weekly_onNewYearsDay() {
        // 2024-01-01 is a Monday
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.WEEKLY,
            LocalDate(2024, 1, 1),
            LocalDate(2024, 1, 1),
        )
        assertEquals(LocalDate(2024, 1, 1), period.start)
        assertEquals(LocalDate(2024, 1, 7), period.end)
    }

    // ═══════════════════════════════════════════════════════════════════
    // getCurrentPeriod() — BIWEEKLY on exact start date
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun getCurrentPeriod_biweekly_onExactStartDate() {
        val startDate = LocalDate(2024, 1, 1)
        val period = BudgetCalculator.getCurrentPeriod(BudgetPeriod.BIWEEKLY, startDate, startDate)

        assertEquals(LocalDate(2024, 1, 1), period.start)
        assertEquals(LocalDate(2024, 1, 14), period.end)
        assertEquals(14, period.daysTotal)
    }

    @Test
    fun getCurrentPeriod_biweekly_lastDayOfFirstPeriod() {
        val startDate = LocalDate(2024, 1, 1)
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.BIWEEKLY,
            startDate,
            LocalDate(2024, 1, 14),
        )
        // Day 13 since start → periodIndex = 13/14 = 0 → first period
        assertEquals(LocalDate(2024, 1, 1), period.start)
        assertEquals(LocalDate(2024, 1, 14), period.end)
    }

    @Test
    fun getCurrentPeriod_biweekly_firstDayOfSecondPeriod() {
        val startDate = LocalDate(2024, 1, 1)
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.BIWEEKLY,
            startDate,
            LocalDate(2024, 1, 15),
        )
        // Day 14 since start → periodIndex = 14/14 = 1 → second period
        assertEquals(LocalDate(2024, 1, 15), period.start)
        assertEquals(LocalDate(2024, 1, 28), period.end)
    }

    // ═══════════════════════════════════════════════════════════════════
    // getCurrentPeriod() — QUARTERLY boundary days
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun getCurrentPeriod_quarterly_firstDayOfQ1() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.QUARTERLY,
            LocalDate(2024, 1, 1),
            LocalDate(2024, 1, 1),
        )
        assertEquals(LocalDate(2024, 1, 1), period.start)
        assertEquals(LocalDate(2024, 3, 31), period.end)
    }

    @Test
    fun getCurrentPeriod_quarterly_lastDayOfQ1() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.QUARTERLY,
            LocalDate(2024, 1, 1),
            LocalDate(2024, 3, 31),
        )
        assertEquals(LocalDate(2024, 1, 1), period.start)
        assertEquals(LocalDate(2024, 3, 31), period.end)
    }

    @Test
    fun getCurrentPeriod_quarterly_firstDayOfQ2() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.QUARTERLY,
            LocalDate(2024, 1, 1),
            LocalDate(2024, 4, 1),
        )
        assertEquals(LocalDate(2024, 4, 1), period.start)
        assertEquals(LocalDate(2024, 6, 30), period.end)
    }

    @Test
    fun getCurrentPeriod_quarterly_q4_endOfYear() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.QUARTERLY,
            LocalDate(2024, 1, 1),
            LocalDate(2024, 12, 31),
        )
        assertEquals(LocalDate(2024, 10, 1), period.start)
        assertEquals(LocalDate(2024, 12, 31), period.end)
    }

    // ═══════════════════════════════════════════════════════════════════
    // getCurrentPeriod() — MONTHLY boundary days
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun getCurrentPeriod_monthly_firstDay() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.MONTHLY,
            LocalDate(2024, 1, 1),
            LocalDate(2024, 6, 1),
        )
        assertEquals(LocalDate(2024, 6, 1), period.start)
        assertEquals(LocalDate(2024, 6, 30), period.end)
    }

    @Test
    fun getCurrentPeriod_monthly_lastDay() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.MONTHLY,
            LocalDate(2024, 1, 1),
            LocalDate(2024, 1, 31),
        )
        assertEquals(LocalDate(2024, 1, 1), period.start)
        assertEquals(LocalDate(2024, 1, 31), period.end)
    }

    // ═══════════════════════════════════════════════════════════════════
    // getCurrentPeriod() — YEARLY leap year
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun getCurrentPeriod_yearly_leapYear2024() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.YEARLY,
            LocalDate(2024, 1, 1),
            LocalDate(2024, 6, 15),
        )
        assertEquals(366, period.daysTotal)
    }

    @Test
    fun getCurrentPeriod_yearly_nonLeapYear2025() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.YEARLY,
            LocalDate(2025, 1, 1),
            LocalDate(2025, 6, 15),
        )
        assertEquals(365, period.daysTotal)
    }

    // ═══════════════════════════════════════════════════════════════════
    // DatePeriod — edge cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun datePeriod_singleDayPeriod() {
        val period = DatePeriod(LocalDate(2024, 6, 15), LocalDate(2024, 6, 15))
        assertEquals(1, period.daysTotal)
        assertEquals(1, period.daysRemaining(LocalDate(2024, 6, 15)))
        assertTrue(period.contains(LocalDate(2024, 6, 15)))
        assertFalse(period.contains(LocalDate(2024, 6, 14)))
        assertFalse(period.contains(LocalDate(2024, 6, 16)))
    }

    @Test
    fun datePeriod_daysRemaining_beforePeriod() {
        val period = DatePeriod(LocalDate(2024, 6, 1), LocalDate(2024, 6, 30))
        // If asking from before the period, returns full remaining from that date to end
        val remaining = period.daysRemaining(LocalDate(2024, 5, 25))
        assertTrue(remaining > period.daysTotal, "Before period start, remaining should exceed total")
    }

    @Test
    fun datePeriod_daysRemaining_firstDay() {
        val period = DatePeriod(LocalDate(2024, 6, 1), LocalDate(2024, 6, 30))
        assertEquals(30, period.daysRemaining(LocalDate(2024, 6, 1)))
    }

    // ═══════════════════════════════════════════════════════════════════
    // dailyBudgetRate() — edge cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun dailyBudgetRate_exactlySpentBudget_returnsZero() {
        val budget = TestFixtures.createBudget(amount = Cents(10000))
        val rate = BudgetCalculator.dailyBudgetRate(budget, Cents(10000), 10)
        assertEquals(Cents.ZERO, rate)
    }

    @Test
    fun dailyBudgetRate_oneDayRemaining() {
        val budget = TestFixtures.createBudget(amount = Cents(10000))
        val rate = BudgetCalculator.dailyBudgetRate(budget, Cents(5000), 1)
        // Remaining $50.00 with 1 day left → $50.00/day
        assertEquals(Cents(5000), rate)
    }

    @Test
    fun dailyBudgetRate_unevenDivision() {
        val budget = TestFixtures.createBudget(amount = Cents(10000))
        val rate = BudgetCalculator.dailyBudgetRate(budget, Cents(0), 3)
        // 10000 / 3 = 3333.33... → banker's round → 3333
        assertEquals(Cents(3333), rate)
    }

    // ═══════════════════════════════════════════════════════════════════
    // BudgetHealth — boundary values
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun healthLevel_justBelowWarningThreshold() {
        // utilization = 0.7499 → HEALTHY
        val budget = TestFixtures.createBudget(
            amount = Cents(10000),
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(7499), date = LocalDate(2024, 6, 10)),
        )
        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))

        assertTrue(status.utilization < 0.75)
        assertEquals(BudgetHealth.HEALTHY, status.healthLevel)
    }

    @Test
    fun healthLevel_justAboveWarningThreshold() {
        // utilization = 0.7501 → WARNING
        val budget = TestFixtures.createBudget(
            amount = Cents(10000),
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(7501), date = LocalDate(2024, 6, 10)),
        )
        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))

        assertTrue(status.utilization > 0.75)
        assertEquals(BudgetHealth.WARNING, status.healthLevel)
    }
}
