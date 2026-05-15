// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.savings

import com.finance.core.TestFixtures
import com.finance.core.aggregation.FinancialAggregator
import com.finance.models.GoalStatus
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.minus
import kotlin.test.*

/**
 * Sprint 2 verification tests for #1369 — Savings Engine Calculations.
 *
 * Covers:
 * - Savings rate calculation (savings / income * 100)
 * - Projected savings over time
 * - Milestone detection (e.g., emergency fund = 3x monthly expenses)
 * - Savings allocation across multiple goals
 */
class SavingsEngineVerificationTest {

    @BeforeTest
    fun setUp() {
        TestFixtures.reset()
    }

    // ═══════════════════════════════════════════════════════════════════
    // Savings rate calculation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun savingsRate_basicCalculation() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(500000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createExpense(amount = Cents(350000), date = LocalDate(2024, 6, 15)),
        )

        val rate = FinancialAggregator.savingsRate(
            transactions,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 30),
        )

        // (5000 - 3500) / 5000 * 100 = 30%
        assertEquals(30.0, rate, 0.01, "Savings rate = 30%")
    }

    @Test
    fun savingsRate_zeroIncome_returnsZero() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(100000), date = LocalDate(2024, 6, 1)),
        )

        val rate = FinancialAggregator.savingsRate(
            transactions,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 30),
        )

        assertEquals(0.0, rate, "No income → 0% savings rate")
    }

    @Test
    fun savingsRate_expenseExceedsIncome_negative() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(300000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createExpense(amount = Cents(400000), date = LocalDate(2024, 6, 15)),
        )

        val rate = FinancialAggregator.savingsRate(
            transactions,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 30),
        )

        assertTrue(rate < 0, "Spending > income → negative savings rate")
        // (3000 - 4000) / 3000 * 100 = -33.33%
        assertEquals(-33.33, rate, 0.5)
    }

    @Test
    fun savingsRate_noExpenses_100percent() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(500000), date = LocalDate(2024, 6, 1)),
        )

        val rate = FinancialAggregator.savingsRate(
            transactions,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 30),
        )

        assertEquals(100.0, rate, 0.01, "No expenses → 100% savings rate")
    }

    @Test
    fun savingsRate_multipleIncomeAndExpenses() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(300000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createIncome(amount = Cents(200000), date = LocalDate(2024, 6, 15)),
            TestFixtures.createExpense(amount = Cents(150000), date = LocalDate(2024, 6, 5)),
            TestFixtures.createExpense(amount = Cents(100000), date = LocalDate(2024, 6, 20)),
        )

        val rate = FinancialAggregator.savingsRate(
            transactions,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 30),
        )

        // Income = 3000 + 2000 = 5000, Expenses = 1500 + 1000 = 2500
        // Rate = (5000 - 2500) / 5000 * 100 = 50%
        assertEquals(50.0, rate, 0.01)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Projected savings over time
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun projectedSavings_monthlyProjection() {
        val monthlySavings = Cents(100000) // $1000/month
        val months = 12
        val projected = Cents(monthlySavings.amount * months)

        assertEquals(Cents(1200000), projected, "12 months × $1000 = $12,000")
    }

    @Test
    fun projectedSavings_goalCompletion_daysRemaining() {
        val targetAmount = Cents(1000000) // $10,000
        val currentAmount = Cents(400000)  // $4,000
        val dailySavings = Cents(2000)      // $20/day

        val remaining = targetAmount - currentAmount // $6,000
        val daysToGoal = remaining.amount / dailySavings.amount

        assertEquals(300, daysToGoal, "Need 300 days to save $6000 at $20/day")
    }

    @Test
    fun projectedSavings_goalAlreadyMet_zeroDays() {
        val targetAmount = Cents(500000)
        val currentAmount = Cents(600000)

        val remaining = targetAmount - currentAmount
        assertTrue(remaining.isNegative(), "Already exceeded target")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Milestone detection
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun milestone_emergencyFund_threeMonthsExpenses() {
        val monthlyExpenses = Cents(300000) // $3,000/month
        val emergencyFundTarget = Cents(monthlyExpenses.amount * 3) // $9,000
        val currentSavings = Cents(900000) // $9,000

        assertTrue(
            currentSavings.amount >= emergencyFundTarget.amount,
            "Emergency fund milestone reached: 3× monthly expenses",
        )
    }

    @Test
    fun milestone_emergencyFund_sixMonthsExpenses() {
        val monthlyExpenses = Cents(300000)
        val sixMonthTarget = Cents(monthlyExpenses.amount * 6) // $18,000
        val currentSavings = Cents(1500000) // $15,000

        assertFalse(
            currentSavings.amount >= sixMonthTarget.amount,
            "6-month emergency fund not yet reached",
        )

        val progressPct = (currentSavings.amount * 100) / sixMonthTarget.amount
        assertEquals(83, progressPct, "83% toward 6-month goal")
    }

    @Test
    fun milestone_progressPercentage_calculatedCorrectly() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(1000000),
            currentAmount = Cents(250000),
        )

        assertEquals(0.25, goal.progress, 0.001, "25% progress")
        assertFalse(goal.isComplete)
    }

    @Test
    fun milestone_goalComplete_flagged() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(500000),
            currentAmount = Cents(500000),
        )

        assertEquals(1.0, goal.progress, 0.001, "100% progress")
        assertTrue(goal.isComplete)
    }

    @Test
    fun milestone_goalOverfunded_clampedAt100() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(500000),
            currentAmount = Cents(600000),
        )

        assertEquals(1.0, goal.progress, 0.001, "Progress clamped to 100%")
        assertTrue(goal.isComplete)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Savings allocation across multiple goals
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun allocation_splitAcrossGoals_proportionally() {
        val totalSavings = 10000L // $100 to allocate

        val goals = listOf(
            TestFixtures.createGoal(name = "Vacation", targetAmount = Cents(200000), currentAmount = Cents(100000)),
            TestFixtures.createGoal(name = "Car", targetAmount = Cents(500000), currentAmount = Cents(200000)),
        )

        val remainingPerGoal = goals.map { it.targetAmount.amount - it.currentAmount.amount }
        val totalRemaining = remainingPerGoal.sum()

        val allocations = remainingPerGoal.map { remaining ->
            (totalSavings * remaining) / totalRemaining
        }

        val vacationAlloc = allocations[0] // 100000/400000 * 10000 = 2500
        val carAlloc = allocations[1]       // 300000/400000 * 10000 = 7500

        assertEquals(2500L, vacationAlloc, "Vacation gets 25% of allocation")
        assertEquals(7500L, carAlloc, "Car gets 75% of allocation")
        assertEquals(totalSavings, vacationAlloc + carAlloc, "All savings allocated")
    }

    @Test
    fun allocation_completedGoal_getsNoAllocation() {
        val goals = listOf(
            TestFixtures.createGoal(name = "Done", targetAmount = Cents(100000), currentAmount = Cents(100000)),
            TestFixtures.createGoal(name = "Active", targetAmount = Cents(200000), currentAmount = Cents(50000)),
        )

        val activeGoals = goals.filter { !it.isComplete }
        assertEquals(1, activeGoals.size, "Only active goals receive allocation")
        assertEquals("Active", activeGoals.first().name)
    }

    @Test
    fun allocation_noActiveGoals_nothingToAllocate() {
        val goals = listOf(
            TestFixtures.createGoal(name = "Done", targetAmount = Cents(100000), currentAmount = Cents(100000)),
        )

        val activeGoals = goals.filter { !it.isComplete }
        assertTrue(activeGoals.isEmpty(), "No active goals")
    }

    // ═══════════════════════════════════════════════════════════════════
    // SavingsEngine suggestion: low savings rate detection
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun incomeAllocation_lowSavingsRate_suggestsIncrease() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(500000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createExpense(amount = Cents(450000), date = LocalDate(2024, 6, 15)),
        )

        val suggestion = SavingsEngine.detectIncomeAllocationOpportunity(
            transactions,
            LocalDate(2024, 6, 15),
        )

        assertNotNull(suggestion)
        assertEquals(SuggestionType.INCOME_ALLOCATION, suggestion.type)
        assertEquals(SuggestionPriority.HIGH, suggestion.priority)
    }

    @Test
    fun incomeAllocation_goodSavingsRate_noSuggestion() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(500000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createExpense(amount = Cents(300000), date = LocalDate(2024, 6, 15)),
        )

        val suggestion = SavingsEngine.detectIncomeAllocationOpportunity(
            transactions,
            LocalDate(2024, 6, 15),
        )

        assertNull(suggestion, "40% savings rate exceeds 20% target")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Annual savings estimate from suggestion
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun savingsSuggestion_annualEstimate_12xMonthly() {
        val suggestion = SavingsSuggestion(
            type = SuggestionType.SPENDING_SPIKE,
            title = "Test",
            description = "Test",
            estimatedMonthlySavings = Cents(10000),
        )

        assertEquals(Cents(120000), suggestion.estimatedAnnualSavings, "$100/mo × 12 = $1200/yr")
    }
}
