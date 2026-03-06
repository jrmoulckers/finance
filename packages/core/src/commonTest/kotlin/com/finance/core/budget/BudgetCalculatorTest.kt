package com.finance.core.budget

import com.finance.core.TestFixtures
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.datetime.*
import kotlin.test.*

class BudgetCalculatorTest {

    // ═══════════════════════════════════════════════════════════════════
    // calculateStatus() — utilization levels
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun calculateStatus_underBudget() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000), // $500
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 6, 10)),
            TestFixtures.createExpense(amount = Cents(5000), date = LocalDate(2024, 6, 15)),
        )
        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))

        assertEquals(Cents(15000), status.spent)
        assertEquals(Cents(35000), status.remaining)
        assertFalse(status.isOverBudget)
        assertEquals(BudgetHealth.HEALTHY, status.healthLevel)
    }

    @Test
    fun calculateStatus_exactlyAtBudget() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000), // $500
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(50000), date = LocalDate(2024, 6, 10)),
        )
        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))

        assertEquals(Cents(50000), status.spent)
        assertEquals(Cents(0), status.remaining)
        assertFalse(status.isOverBudget) // spent == budget, not over
        assertEquals(1.0, status.utilization, 1e-10)
        assertEquals(BudgetHealth.WARNING, status.healthLevel) // >0.75
    }

    @Test
    fun calculateStatus_overBudget() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000), // $500
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(60000), date = LocalDate(2024, 6, 10)),
        )
        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))

        assertEquals(Cents(60000), status.spent)
        assertTrue(status.remaining.isNegative())
        assertTrue(status.isOverBudget)
        assertTrue(status.utilization > 1.0)
        assertEquals(BudgetHealth.OVER, status.healthLevel)
    }

    @Test
    fun calculateStatus_noTransactions() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )
        val status = BudgetCalculator.calculateStatus(budget, emptyList(), LocalDate(2024, 6, 15))

        assertEquals(Cents(0), status.spent)
        assertEquals(Cents(50000), status.remaining)
        assertFalse(status.isOverBudget)
        assertEquals(0.0, status.utilization)
        assertEquals(BudgetHealth.HEALTHY, status.healthLevel)
    }

    @Test
    fun calculateStatus_filtersOutDeletedTransactions() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 6, 10)),
            TestFixtures.createExpense(
                amount = Cents(20000),
                date = LocalDate(2024, 6, 12),
                deletedAt = TestFixtures.fixedInstant,
            ),
        )
        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))

        // Only the non-deleted transaction counts
        assertEquals(Cents(10000), status.spent)
    }

    @Test
    fun calculateStatus_filtersOutIncomeTransactions() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 6, 10)),
            TestFixtures.createIncome(amount = Cents(100000), date = LocalDate(2024, 6, 5)),
        )
        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))

        // Only the expense counts
        assertEquals(Cents(10000), status.spent)
    }

    @Test
    fun calculateStatus_filtersOutTransactionsOutsidePeriod() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 6, 10)),
            TestFixtures.createExpense(amount = Cents(20000), date = LocalDate(2024, 5, 30)), // May
            TestFixtures.createExpense(amount = Cents(30000), date = LocalDate(2024, 7, 1)),  // July
        )
        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))

        // Only June transaction counts
        assertEquals(Cents(10000), status.spent)
    }

    // ═══════════════════════════════════════════════════════════════════
    // BudgetHealth levels
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun healthLevel_healthy_below75percent() {
        val budget = TestFixtures.createBudget(amount = Cents(10000), startDate = LocalDate(2024, 6, 1))
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(7000), date = LocalDate(2024, 6, 10)),
        )
        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))

        assertEquals(BudgetHealth.HEALTHY, status.healthLevel)
    }

    @Test
    fun healthLevel_warning_at75percent() {
        val budget = TestFixtures.createBudget(amount = Cents(10000), startDate = LocalDate(2024, 6, 1))
        // Spend just over 75% = 7501 cents
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(7501), date = LocalDate(2024, 6, 10)),
        )
        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))

        assertEquals(BudgetHealth.WARNING, status.healthLevel)
    }

    @Test
    fun healthLevel_over_above100percent() {
        val budget = TestFixtures.createBudget(amount = Cents(10000), startDate = LocalDate(2024, 6, 1))
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(10001), date = LocalDate(2024, 6, 10)),
        )
        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))

        assertEquals(BudgetHealth.OVER, status.healthLevel)
    }

    @Test
    fun healthLevel_exactlyAt75_isHealthy() {
        // utilization = 0.75, which is NOT > 0.75, so HEALTHY
        val budget = TestFixtures.createBudget(amount = Cents(10000), startDate = LocalDate(2024, 6, 1))
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(7500), date = LocalDate(2024, 6, 10)),
        )
        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))

        assertEquals(0.75, status.utilization, 1e-10)
        assertEquals(BudgetHealth.HEALTHY, status.healthLevel) // <= 0.75 is healthy
    }

    // ═══════════════════════════════════════════════════════════════════
    // getCurrentPeriod() — WEEKLY
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun getCurrentPeriod_weekly() {
        // 2024-06-15 is a Saturday. Monday = 2024-06-10, Sunday = 2024-06-16
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.WEEKLY,
            LocalDate(2024, 1, 1),
            LocalDate(2024, 6, 15),
        )
        assertEquals(LocalDate(2024, 6, 10), period.start) // Monday
        assertEquals(LocalDate(2024, 6, 16), period.end)   // Sunday
        assertEquals(7, period.daysTotal)
    }

    @Test
    fun getCurrentPeriod_weekly_onMonday() {
        // 2024-06-10 is Monday
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.WEEKLY,
            LocalDate(2024, 1, 1),
            LocalDate(2024, 6, 10),
        )
        assertEquals(LocalDate(2024, 6, 10), period.start)
        assertEquals(LocalDate(2024, 6, 16), period.end)
    }

    // ═══════════════════════════════════════════════════════════════════
    // getCurrentPeriod() — BIWEEKLY
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun getCurrentPeriod_biweekly() {
        val startDate = LocalDate(2024, 1, 1)
        val refDate = LocalDate(2024, 1, 10)
        val period = BudgetCalculator.getCurrentPeriod(BudgetPeriod.BIWEEKLY, startDate, refDate)

        // Days since start: 9, periodIndex = 9/14 = 0
        // Period: Jan 1 – Jan 14
        assertEquals(LocalDate(2024, 1, 1), period.start)
        assertEquals(LocalDate(2024, 1, 14), period.end)
        assertEquals(14, period.daysTotal)
    }

    @Test
    fun getCurrentPeriod_biweekly_secondPeriod() {
        val startDate = LocalDate(2024, 1, 1)
        val refDate = LocalDate(2024, 1, 20)
        val period = BudgetCalculator.getCurrentPeriod(BudgetPeriod.BIWEEKLY, startDate, refDate)

        // Days since start: 19, periodIndex = 19/14 = 1
        // Period: Jan 15 – Jan 28
        assertEquals(LocalDate(2024, 1, 15), period.start)
        assertEquals(LocalDate(2024, 1, 28), period.end)
    }

    // ═══════════════════════════════════════════════════════════════════
    // getCurrentPeriod() — MONTHLY
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun getCurrentPeriod_monthly_june() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.MONTHLY,
            LocalDate(2024, 1, 1),
            LocalDate(2024, 6, 15),
        )
        assertEquals(LocalDate(2024, 6, 1), period.start)
        assertEquals(LocalDate(2024, 6, 30), period.end)
        assertEquals(30, period.daysTotal)
    }

    @Test
    fun getCurrentPeriod_monthly_january() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.MONTHLY,
            LocalDate(2024, 1, 1),
            LocalDate(2024, 1, 15),
        )
        assertEquals(LocalDate(2024, 1, 1), period.start)
        assertEquals(LocalDate(2024, 1, 31), period.end)
        assertEquals(31, period.daysTotal)
    }

    @Test
    fun getCurrentPeriod_monthly_february_leapYear() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.MONTHLY,
            LocalDate(2024, 1, 1),
            LocalDate(2024, 2, 15),
        )
        assertEquals(LocalDate(2024, 2, 1), period.start)
        assertEquals(LocalDate(2024, 2, 29), period.end) // 2024 is a leap year
        assertEquals(29, period.daysTotal)
    }

    @Test
    fun getCurrentPeriod_monthly_february_nonLeapYear() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.MONTHLY,
            LocalDate(2023, 1, 1),
            LocalDate(2023, 2, 15),
        )
        assertEquals(LocalDate(2023, 2, 1), period.start)
        assertEquals(LocalDate(2023, 2, 28), period.end)
        assertEquals(28, period.daysTotal)
    }

    @Test
    fun getCurrentPeriod_monthly_december() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.MONTHLY,
            LocalDate(2024, 1, 1),
            LocalDate(2024, 12, 15),
        )
        assertEquals(LocalDate(2024, 12, 1), period.start)
        assertEquals(LocalDate(2024, 12, 31), period.end)
        assertEquals(31, period.daysTotal)
    }

    // ═══════════════════════════════════════════════════════════════════
    // getCurrentPeriod() — QUARTERLY
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun getCurrentPeriod_quarterly_q1() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.QUARTERLY,
            LocalDate(2024, 1, 1),
            LocalDate(2024, 2, 15),
        )
        assertEquals(LocalDate(2024, 1, 1), period.start)
        assertEquals(LocalDate(2024, 3, 31), period.end)
    }

    @Test
    fun getCurrentPeriod_quarterly_q2() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.QUARTERLY,
            LocalDate(2024, 1, 1),
            LocalDate(2024, 5, 15),
        )
        assertEquals(LocalDate(2024, 4, 1), period.start)
        assertEquals(LocalDate(2024, 6, 30), period.end)
    }

    @Test
    fun getCurrentPeriod_quarterly_q3() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.QUARTERLY,
            LocalDate(2024, 1, 1),
            LocalDate(2024, 8, 15),
        )
        assertEquals(LocalDate(2024, 7, 1), period.start)
        assertEquals(LocalDate(2024, 9, 30), period.end)
    }

    @Test
    fun getCurrentPeriod_quarterly_q4() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.QUARTERLY,
            LocalDate(2024, 1, 1),
            LocalDate(2024, 11, 15),
        )
        assertEquals(LocalDate(2024, 10, 1), period.start)
        assertEquals(LocalDate(2024, 12, 31), period.end)
    }

    // ═══════════════════════════════════════════════════════════════════
    // getCurrentPeriod() — YEARLY
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun getCurrentPeriod_yearly() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.YEARLY,
            LocalDate(2024, 1, 1),
            LocalDate(2024, 6, 15),
        )
        assertEquals(LocalDate(2024, 1, 1), period.start)
        assertEquals(LocalDate(2024, 12, 31), period.end)
        assertEquals(366, period.daysTotal) // 2024 is a leap year
    }

    @Test
    fun getCurrentPeriod_yearly_nonLeapYear() {
        val period = BudgetCalculator.getCurrentPeriod(
            BudgetPeriod.YEARLY,
            LocalDate(2023, 1, 1),
            LocalDate(2023, 6, 15),
        )
        assertEquals(LocalDate(2023, 1, 1), period.start)
        assertEquals(LocalDate(2023, 12, 31), period.end)
        assertEquals(365, period.daysTotal)
    }

    // ═══════════════════════════════════════════════════════════════════
    // DatePeriod helpers
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun datePeriod_daysRemaining() {
        val period = DatePeriod(LocalDate(2024, 6, 1), LocalDate(2024, 6, 30))
        // From June 15: 15 days remaining (15th through 30th = 16 days)
        assertEquals(16, period.daysRemaining(LocalDate(2024, 6, 15)))
    }

    @Test
    fun datePeriod_daysRemaining_lastDay() {
        val period = DatePeriod(LocalDate(2024, 6, 1), LocalDate(2024, 6, 30))
        assertEquals(1, period.daysRemaining(LocalDate(2024, 6, 30)))
    }

    @Test
    fun datePeriod_daysRemaining_afterPeriod() {
        val period = DatePeriod(LocalDate(2024, 6, 1), LocalDate(2024, 6, 30))
        assertEquals(0, period.daysRemaining(LocalDate(2024, 7, 5)))
    }

    @Test
    fun datePeriod_contains() {
        val period = DatePeriod(LocalDate(2024, 6, 1), LocalDate(2024, 6, 30))
        assertTrue(period.contains(LocalDate(2024, 6, 1)))
        assertTrue(period.contains(LocalDate(2024, 6, 15)))
        assertTrue(period.contains(LocalDate(2024, 6, 30)))
        assertFalse(period.contains(LocalDate(2024, 5, 31)))
        assertFalse(period.contains(LocalDate(2024, 7, 1)))
    }

    // ═══════════════════════════════════════════════════════════════════
    // dailyBudgetRate()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun dailyBudgetRate_positiveRemaining() {
        val budget = TestFixtures.createBudget(amount = Cents(30000)) // $300
        val spent = Cents(15000) // $150 spent
        val daysRemaining = 15
        val rate = BudgetCalculator.dailyBudgetRate(budget, spent, daysRemaining)

        // (30000 - 15000) / 15 = 1000
        assertEquals(Cents(1000), rate) // $10/day
    }

    @Test
    fun dailyBudgetRate_zeroDaysRemaining() {
        val budget = TestFixtures.createBudget(amount = Cents(30000))
        val rate = BudgetCalculator.dailyBudgetRate(budget, Cents(15000), 0)
        assertEquals(Cents.ZERO, rate)
    }

    @Test
    fun dailyBudgetRate_negativeDaysRemaining() {
        val budget = TestFixtures.createBudget(amount = Cents(30000))
        val rate = BudgetCalculator.dailyBudgetRate(budget, Cents(15000), -1)
        assertEquals(Cents.ZERO, rate)
    }

    @Test
    fun dailyBudgetRate_overBudget() {
        val budget = TestFixtures.createBudget(amount = Cents(30000)) // $300
        val spent = Cents(35000) // $350 — over budget
        val rate = BudgetCalculator.dailyBudgetRate(budget, spent, 10)
        assertEquals(Cents.ZERO, rate)
    }

    @Test
    fun dailyBudgetRate_nothingSpent() {
        val budget = TestFixtures.createBudget(amount = Cents(30000)) // $300
        val rate = BudgetCalculator.dailyBudgetRate(budget, Cents.ZERO, 30)
        // 30000 / 30 = 1000
        assertEquals(Cents(1000), rate)
    }
}
