package com.finance.core.insights

import com.finance.core.TestFixtures
import com.finance.core.budget.BudgetCalculator
import com.finance.core.budget.BudgetHealth
import com.finance.core.budget.BudgetStatus
import com.finance.core.budget.DatePeriod
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.datetime.*
import kotlin.test.*

class InsightEngineTest {

    @Test
    fun spendingVelocity_increasedSpending_returnsRatioAboveOne() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 5, 10)),
            TestFixtures.createExpense(amount = Cents(15000), date = LocalDate(2024, 6, 10)),
        )
        val current = LocalDate(2024, 6, 1)..LocalDate(2024, 6, 30)
        val previous = LocalDate(2024, 5, 1)..LocalDate(2024, 5, 31)
        val velocity = InsightEngine.calculateSpendingVelocity(transactions, current, previous)
        assertEquals(1.5, velocity, 1e-10)
    }

    @Test
    fun spendingVelocity_decreasedSpending_returnsRatioBelowOne() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(20000), date = LocalDate(2024, 5, 10)),
            TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 6, 10)),
        )
        val current = LocalDate(2024, 6, 1)..LocalDate(2024, 6, 30)
        val previous = LocalDate(2024, 5, 1)..LocalDate(2024, 5, 31)
        assertEquals(0.5, InsightEngine.calculateSpendingVelocity(transactions, current, previous), 1e-10)
    }

    @Test
    fun spendingVelocity_zeroPreviousWithCurrentSpending_returnsInfinity() {
        val transactions = listOf(TestFixtures.createExpense(amount = Cents(5000), date = LocalDate(2024, 6, 10)))
        val current = LocalDate(2024, 6, 1)..LocalDate(2024, 6, 30)
        val previous = LocalDate(2024, 5, 1)..LocalDate(2024, 5, 31)
        assertTrue(InsightEngine.calculateSpendingVelocity(transactions, current, previous).isInfinite())
    }

    @Test
    fun spendingVelocity_zeroInBothPeriods_returnsZero() {
        val current = LocalDate(2024, 6, 1)..LocalDate(2024, 6, 30)
        val previous = LocalDate(2024, 5, 1)..LocalDate(2024, 5, 31)
        assertEquals(0.0, InsightEngine.calculateSpendingVelocity(emptyList(), current, previous), 1e-10)
    }

    @Test
    fun spendingVelocity_ignoresDeletedTransactions() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 5, 10)),
            TestFixtures.createExpense(amount = Cents(50000), date = LocalDate(2024, 6, 10), deletedAt = TestFixtures.fixedInstant),
            TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 6, 15)),
        )
        val current = LocalDate(2024, 6, 1)..LocalDate(2024, 6, 30)
        val previous = LocalDate(2024, 5, 1)..LocalDate(2024, 5, 31)
        assertEquals(1.0, InsightEngine.calculateSpendingVelocity(transactions, current, previous), 1e-10)
    }

    @Test
    fun spendingVelocity_ignoresIncomeTransactions() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 5, 10)),
            TestFixtures.createIncome(amount = Cents(100000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createExpense(amount = Cents(20000), date = LocalDate(2024, 6, 10)),
        )
        val current = LocalDate(2024, 6, 1)..LocalDate(2024, 6, 30)
        val previous = LocalDate(2024, 5, 1)..LocalDate(2024, 5, 31)
        assertEquals(2.0, InsightEngine.calculateSpendingVelocity(transactions, current, previous), 1e-10)
    }

    @Test fun savingsRate_normalCase() { assertEquals(30.0, InsightEngine.calculateSavingsRate(Cents(100000), Cents(70000)), 1e-10) }
    @Test fun savingsRate_zeroIncome_returnsZero() { assertEquals(0.0, InsightEngine.calculateSavingsRate(Cents.ZERO, Cents(50000)), 1e-10) }
    @Test fun savingsRate_negativeIncome_returnsZero() { assertEquals(0.0, InsightEngine.calculateSavingsRate(Cents(-5000), Cents(3000)), 1e-10) }
    @Test fun savingsRate_expensesExceedIncome_returnsZero() { assertEquals(0.0, InsightEngine.calculateSavingsRate(Cents(50000), Cents(60000)), 1e-10) }
    @Test fun savingsRate_zeroExpenses_returns100() { assertEquals(100.0, InsightEngine.calculateSavingsRate(Cents(100000), Cents.ZERO), 1e-10) }
    @Test fun savingsRate_equalIncomeAndExpenses_returnsZero() { assertEquals(0.0, InsightEngine.calculateSavingsRate(Cents(50000), Cents(50000)), 1e-10) }

    @Test fun budgetHealthScore_emptyBudgets_returns100() { assertEquals(100, InsightEngine.budgetHealthScore(emptyList())) }

    @Test
    fun budgetHealthScore_allHealthy_returns100() {
        val budget = TestFixtures.createBudget(amount = Cents(50000))
        val statuses = listOf(BudgetStatus(budget = budget, period = DatePeriod(LocalDate(2024, 6, 1), LocalDate(2024, 6, 30)),
            spent = Cents(10000), remaining = Cents(40000), utilization = 0.2, isOverBudget = false))
        assertEquals(100, InsightEngine.budgetHealthScore(statuses))
    }

    @Test
    fun budgetHealthScore_allOver_returnsZero() {
        val budget = TestFixtures.createBudget(amount = Cents(50000))
        val statuses = listOf(BudgetStatus(budget = budget, period = DatePeriod(LocalDate(2024, 6, 1), LocalDate(2024, 6, 30)),
            spent = Cents(60000), remaining = Cents(-10000), utilization = 1.2, isOverBudget = true))
        assertEquals(0, InsightEngine.budgetHealthScore(statuses))
    }

    @Test
    fun budgetHealthScore_mixedHealthLevels() {
        val budget = TestFixtures.createBudget(amount = Cents(50000))
        val period = DatePeriod(LocalDate(2024, 6, 1), LocalDate(2024, 6, 30))
        val statuses = listOf(
            BudgetStatus(budget = budget, period = period, spent = Cents(10000), remaining = Cents(40000), utilization = 0.2, isOverBudget = false),
            BudgetStatus(budget = budget, period = period, spent = Cents(40000), remaining = Cents(10000), utilization = 0.8, isOverBudget = false),
            BudgetStatus(budget = budget, period = period, spent = Cents(60000), remaining = Cents(-10000), utilization = 1.2, isOverBudget = true),
        )
        assertEquals(50, InsightEngine.budgetHealthScore(statuses))
    }

    @Test
    fun generateInsights_emptyData_returnsEmptyList() {
        val current = LocalDate(2024, 6, 1)..LocalDate(2024, 6, 30)
        val previous = LocalDate(2024, 5, 1)..LocalDate(2024, 5, 31)
        assertTrue(InsightEngine.generateInsights(emptyList(), emptyList(), emptyList(), current, previous).isEmpty())
    }

    @Test
    fun generateInsights_spendingIncreased_emitsSpendingUp() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 5, 10)),
            TestFixtures.createExpense(amount = Cents(20000), date = LocalDate(2024, 6, 10)),
        )
        val current = LocalDate(2024, 6, 1)..LocalDate(2024, 6, 30)
        val previous = LocalDate(2024, 5, 1)..LocalDate(2024, 5, 31)
        val insights = InsightEngine.generateInsights(transactions, emptyList(), emptyList(), current, previous)
        val spendingUp = insights.filterIsInstance<Insight.SpendingUp>()
        assertEquals(1, spendingUp.size)
        assertEquals(2.0, spendingUp.first().velocityRatio, 1e-10)
        assertEquals(Cents(10000), spendingUp.first().increaseAmount)
    }

    @Test
    fun generateInsights_spendingDecreased_emitsSpendingDown() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(30000), date = LocalDate(2024, 5, 10)),
            TestFixtures.createExpense(amount = Cents(15000), date = LocalDate(2024, 6, 10)),
        )
        val current = LocalDate(2024, 6, 1)..LocalDate(2024, 6, 30)
        val previous = LocalDate(2024, 5, 1)..LocalDate(2024, 5, 31)
        val insights = InsightEngine.generateInsights(transactions, emptyList(), emptyList(), current, previous)
        val spendingDown = insights.filterIsInstance<Insight.SpendingDown>()
        assertEquals(1, spendingDown.size)
        assertEquals(0.5, spendingDown.first().velocityRatio, 1e-10)
    }

    @Test
    fun generateInsights_healthyBudget_emitsBudgetOnTrack() {
        val budget = TestFixtures.createBudget(name = "Groceries", amount = Cents(50000))
        val period = DatePeriod(LocalDate(2024, 6, 1), LocalDate(2024, 6, 30))
        val status = BudgetStatus(budget = budget, period = period, spent = Cents(10000), remaining = Cents(40000), utilization = 0.2, isOverBudget = false)
        val current = LocalDate(2024, 6, 1)..LocalDate(2024, 6, 30)
        val previous = LocalDate(2024, 5, 1)..LocalDate(2024, 5, 31)
        val insights = InsightEngine.generateInsights(emptyList(), listOf(status), emptyList(), current, previous)
        val onTrack = insights.filterIsInstance<Insight.BudgetOnTrack>()
        assertEquals(1, onTrack.size)
        assertEquals("Groceries", onTrack.first().budgetName)
    }

    @Test
    fun generateInsights_overBudget_emitsBudgetAtRisk() {
        val budget = TestFixtures.createBudget(name = "Dining", amount = Cents(30000))
        val period = DatePeriod(LocalDate(2024, 6, 1), LocalDate(2024, 6, 30))
        val status = BudgetStatus(budget = budget, period = period, spent = Cents(35000), remaining = Cents(-5000), utilization = 1.17, isOverBudget = true)
        val current = LocalDate(2024, 6, 1)..LocalDate(2024, 6, 30)
        val previous = LocalDate(2024, 5, 1)..LocalDate(2024, 5, 31)
        val insights = InsightEngine.generateInsights(emptyList(), listOf(status), emptyList(), current, previous, referenceDate = LocalDate(2024, 6, 15))
        val atRisk = insights.filterIsInstance<Insight.BudgetAtRisk>()
        assertEquals(1, atRisk.size)
        assertEquals("Dining", atRisk.first().budgetName)
        assertTrue(atRisk.first().utilization > 1.0)
    }

    @Test
    fun generateInsights_goalBehindSchedule_emitsGoalBehind() {
        val goal = Goal(id = SyncId("goal-1"), householdId = SyncId("household-1"), name = "Emergency Fund",
            targetAmount = Cents(1000000), currentAmount = Cents(10000), currency = Currency.USD,
            targetDate = LocalDate(2024, 12, 31), status = GoalStatus.ACTIVE,
            createdAt = Instant.parse("2024-01-01T00:00:00Z"), updatedAt = Instant.parse("2024-06-15T00:00:00Z"))
        val current = LocalDate(2024, 6, 1)..LocalDate(2024, 6, 30)
        val previous = LocalDate(2024, 5, 1)..LocalDate(2024, 5, 31)
        val insights = InsightEngine.generateInsights(emptyList(), emptyList(), listOf(goal), current, previous, referenceDate = LocalDate(2024, 6, 15))
        val goalBehind = insights.filterIsInstance<Insight.GoalBehind>()
        assertEquals(1, goalBehind.size)
        assertEquals("Emergency Fund", goalBehind.first().goalName)
        assertTrue(goalBehind.first().progress < goalBehind.first().expectedProgress)
    }

    @Test
    fun generateInsights_goalAheadOfSchedule_emitsGoalAhead() {
        val goal = Goal(id = SyncId("goal-2"), householdId = SyncId("household-1"), name = "Vacation Fund",
            targetAmount = Cents(500000), currentAmount = Cents(400000), currency = Currency.USD,
            targetDate = LocalDate(2024, 12, 31), status = GoalStatus.ACTIVE,
            createdAt = Instant.parse("2024-01-01T00:00:00Z"), updatedAt = Instant.parse("2024-06-15T00:00:00Z"))
        val current = LocalDate(2024, 6, 1)..LocalDate(2024, 6, 30)
        val previous = LocalDate(2024, 5, 1)..LocalDate(2024, 5, 31)
        val insights = InsightEngine.generateInsights(emptyList(), emptyList(), listOf(goal), current, previous, referenceDate = LocalDate(2024, 6, 15))
        val goalAhead = insights.filterIsInstance<Insight.GoalAhead>()
        assertEquals(1, goalAhead.size)
        assertEquals("Vacation Fund", goalAhead.first().goalName)
        assertTrue(goalAhead.first().progress > goalAhead.first().expectedProgress)
    }

    @Test
    fun generateInsights_savingsImproved_emitsSavingsImproved() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(500000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createExpense(amount = Cents(300000), date = LocalDate(2024, 6, 15)),
        )
        val current = LocalDate(2024, 6, 1)..LocalDate(2024, 6, 30)
        val previous = LocalDate(2024, 5, 1)..LocalDate(2024, 5, 31)
        val insights = InsightEngine.generateInsights(transactions, emptyList(), emptyList(), current, previous,
            previousIncome = Cents(500000), previousExpenses = Cents(400000))
        val savingsImproved = insights.filterIsInstance<Insight.SavingsImproved>()
        assertEquals(1, savingsImproved.size)
        assertEquals(40.0, savingsImproved.first().currentRate, 1e-10)
        assertEquals(20.0, savingsImproved.first().previousRate, 1e-10)
    }
}
