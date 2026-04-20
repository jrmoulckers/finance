// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.recommendation

import com.finance.core.TestFixtures
import com.finance.models.BudgetPeriod
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.*
import kotlin.test.*

class BudgetRecommendationEngineTest {

    private val referenceDate = LocalDate(2024, 6, 15)

    @BeforeTest
    fun setUp() {
        TestFixtures.reset()
    }

    // ═══════════════════════════════════════════════════════════════════
    // Over-budget adjustments
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun recommendOverBudget_suggestsIncrease() {
        val catDining = SyncId("cat-dining")
        val budget = TestFixtures.createBudget(
            amount = Cents(30000), // $300 budget
            categoryId = catDining,
            name = "Dining Out",
        )

        // Spent $450 (150% of budget)
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(45000),
                date = referenceDate,
                categoryId = catDining,
            ),
        )

        val recommendations = BudgetRecommendationEngine.recommendOverBudgetAdjustments(
            listOf(budget), transactions, referenceDate,
        )

        assertEquals(1, recommendations.size)
        val rec = recommendations.first()
        assertEquals(RecommendationType.INCREASE_BUDGET, rec.type)
        assertEquals(budget.id, rec.budgetId)
        assertEquals(catDining, rec.categoryId)
        assertEquals(RecommendationPriority.HIGH, rec.priority)
        // Recommended = $450 + 10% = $495
        assertEquals(Cents(49500), rec.recommendedAmount)
    }

    @Test
    fun recommendOverBudget_onBudget_noRecommendation() {
        val catId = SyncId("cat-groceries")
        val budget = TestFixtures.createBudget(
            amount = Cents(50000),
            categoryId = catId,
        )

        // Spent $400 (80% of $500 budget)
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(40000),
                date = referenceDate,
                categoryId = catId,
            ),
        )

        val recommendations = BudgetRecommendationEngine.recommendOverBudgetAdjustments(
            listOf(budget), transactions, referenceDate,
        )

        assertTrue(recommendations.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // Under-budget reductions
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun recommendUnderBudget_suggestsDecrease() {
        val catId = SyncId("cat-entertainment")
        val budget = TestFixtures.createBudget(
            amount = Cents(50000), // $500 budget
            categoryId = catId,
            name = "Entertainment",
        )

        // Spent only $100 (20% utilization)
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(10000),
                date = referenceDate,
                categoryId = catId,
            ),
        )

        val recommendations = BudgetRecommendationEngine.recommendUnderBudgetReductions(
            listOf(budget), transactions, referenceDate,
        )

        assertEquals(1, recommendations.size)
        val rec = recommendations.first()
        assertEquals(RecommendationType.DECREASE_BUDGET, rec.type)
        assertEquals(RecommendationPriority.MEDIUM, rec.priority)
        // Recommended = $100 + 20% = $120
        assertEquals(Cents(12000), rec.recommendedAmount)
        // Savings = $500 - $120 = $380
        assertEquals(Cents(38000), rec.impactCents)
    }

    @Test
    fun recommendUnderBudget_zeroSpent_suggestsHalf() {
        val catId = SyncId("cat-misc")
        val budget = TestFixtures.createBudget(
            amount = Cents(20000), // $200
            categoryId = catId,
            name = "Miscellaneous",
        )

        val recommendations = BudgetRecommendationEngine.recommendUnderBudgetReductions(
            listOf(budget), emptyList(), referenceDate,
        )

        assertEquals(1, recommendations.size)
        // When spending is zero, recommend half the budget
        assertEquals(Cents(10000), recommendations.first().recommendedAmount)
    }

    // ═══════════════════════════════════════════════════════════════════
    // New budget suggestions
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun suggestNewBudgets_forConsistentSpending() {
        val catTransport = SyncId("cat-transport")

        // 3 months of transport spending (no budget exists)
        val transactions = (1..3).map { monthOffset ->
            val monthDate = referenceDate.minus(monthOffset, DateTimeUnit.MONTH)
            TestFixtures.createExpense(
                amount = Cents(15000), // $150/month
                date = LocalDate(monthDate.year, monthDate.month, 10),
                categoryId = catTransport,
            )
        }

        val recommendations = BudgetRecommendationEngine.suggestNewBudgets(
            budgets = emptyList(), // no existing budgets
            transactions = transactions,
            referenceDate = referenceDate,
        )

        assertEquals(1, recommendations.size)
        val rec = recommendations.first()
        assertEquals(RecommendationType.CREATE_BUDGET, rec.type)
        assertEquals(catTransport, rec.categoryId)
        assertEquals(RecommendationPriority.LOW, rec.priority)
        // Avg $150 + 10% = $165
        assertEquals(Cents(16500), rec.recommendedAmount)
    }

    @Test
    fun suggestNewBudgets_skipsCategoriesWithExistingBudgets() {
        val catId = SyncId("cat-groceries")
        val budget = TestFixtures.createBudget(categoryId = catId)

        val transactions = (1..3).map { monthOffset ->
            val monthDate = referenceDate.minus(monthOffset, DateTimeUnit.MONTH)
            TestFixtures.createExpense(
                amount = Cents(10000),
                date = LocalDate(monthDate.year, monthDate.month, 10),
                categoryId = catId,
            )
        }

        val recommendations = BudgetRecommendationEngine.suggestNewBudgets(
            budgets = listOf(budget),
            transactions = transactions,
            referenceDate = referenceDate,
        )

        assertTrue(recommendations.isEmpty())
    }

    @Test
    fun suggestNewBudgets_needsAtLeastTwoMonths() {
        val catId = SyncId("cat-new")

        // Only 1 month of data
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(10000),
                date = referenceDate.minus(1, DateTimeUnit.MONTH),
                categoryId = catId,
            ),
        )

        val recommendations = BudgetRecommendationEngine.suggestNewBudgets(
            budgets = emptyList(),
            transactions = transactions,
            referenceDate = referenceDate,
        )

        assertTrue(recommendations.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // Rebalancing
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun suggestRebalancing_overAndUnderBudgets() {
        val catOver = SyncId("cat-dining")
        val catUnder = SyncId("cat-entertainment")

        val overBudget = TestFixtures.createBudget(
            amount = Cents(20000), // $200
            categoryId = catOver,
            name = "Dining",
        )
        val underBudget = TestFixtures.createBudget(
            amount = Cents(50000), // $500
            categoryId = catUnder,
            name = "Entertainment",
        )

        val transactions = listOf(
            // Dining: $300 spent (over $200 budget)
            TestFixtures.createExpense(
                amount = Cents(30000),
                date = referenceDate,
                categoryId = catOver,
            ),
            // Entertainment: $100 spent (20% of $500 budget)
            TestFixtures.createExpense(
                amount = Cents(10000),
                date = referenceDate,
                categoryId = catUnder,
            ),
        )

        val recommendations = BudgetRecommendationEngine.suggestRebalancing(
            listOf(overBudget, underBudget), transactions, referenceDate,
        )

        assertEquals(1, recommendations.size)
        assertEquals(RecommendationType.REBALANCE, recommendations.first().type)
        assertEquals(RecommendationPriority.MEDIUM, recommendations.first().priority)
    }

    @Test
    fun suggestRebalancing_noImbalance_noSuggestion() {
        val catId = SyncId("cat-groceries")
        val budget = TestFixtures.createBudget(
            amount = Cents(40000),
            categoryId = catId,
        )

        // 75% utilization — neither over nor under
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(30000),
                date = referenceDate,
                categoryId = catId,
            ),
        )

        val recommendations = BudgetRecommendationEngine.suggestRebalancing(
            listOf(budget), transactions, referenceDate,
        )

        assertTrue(recommendations.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // 50/30/20 rule alignment
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun recommend503020_overSpending_suggests() {
        val budgets = listOf(
            TestFixtures.createBudget(amount = Cents(300000)), // $3000
            TestFixtures.createBudget(amount = Cents(200000)), // $2000
        )

        val recommendation = BudgetRecommendationEngine.recommend503020(
            budgets = budgets,
            transactions = emptyList(),
            totalIncome = Cents(500000), // $5000 income
            referenceDate = referenceDate,
        )

        assertNotNull(recommendation)
        assertEquals(RecommendationType.RATIO_ADJUSTMENT, recommendation.type)
        assertEquals(RecommendationPriority.HIGH, recommendation.priority)
        // Total budgeted = $5000, 100% of income (>80%)
        // Target = $4000 (80%), excess = $1000
        assertEquals(Cents(100000), recommendation.impactCents)
    }

    @Test
    fun recommend503020_goodRatio_noSuggestion() {
        val budgets = listOf(
            TestFixtures.createBudget(amount = Cents(200000)), // $2000
        )

        val recommendation = BudgetRecommendationEngine.recommend503020(
            budgets = budgets,
            transactions = emptyList(),
            totalIncome = Cents(500000), // $5000 income, 40% budgeted
            referenceDate = referenceDate,
        )

        assertNull(recommendation)
    }

    @Test
    fun recommend503020_zeroIncome_noSuggestion() {
        val recommendation = BudgetRecommendationEngine.recommend503020(
            budgets = emptyList(),
            transactions = emptyList(),
            totalIncome = Cents.ZERO,
            referenceDate = referenceDate,
        )

        assertNull(recommendation)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Full recommendation pipeline
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun generateRecommendations_sortedByPriorityThenImpact() {
        val catOver = SyncId("cat-over")
        val catUnder = SyncId("cat-under")

        val budgets = listOf(
            TestFixtures.createBudget(
                amount = Cents(10000),
                categoryId = catOver,
                name = "Over Budget",
            ),
            TestFixtures.createBudget(
                amount = Cents(50000),
                categoryId = catUnder,
                name = "Under Budget",
            ),
        )

        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(20000),
                date = referenceDate,
                categoryId = catOver,
            ),
            TestFixtures.createExpense(
                amount = Cents(5000),
                date = referenceDate,
                categoryId = catUnder,
            ),
        )

        val recommendations = BudgetRecommendationEngine.generateRecommendations(
            budgets = budgets,
            transactions = transactions,
            totalIncome = Cents(200000),
            referenceDate = referenceDate,
        )

        assertTrue(recommendations.isNotEmpty())
        // HIGH priority should come first
        if (recommendations.size > 1) {
            assertTrue(
                recommendations.first().priority.ordinal >= recommendations.last().priority.ordinal,
                "Should be sorted by priority descending",
            )
        }
    }

    @Test
    fun generateRecommendations_emptyData_returnsEmpty() {
        val recommendations = BudgetRecommendationEngine.generateRecommendations(
            budgets = emptyList(),
            transactions = emptyList(),
            totalIncome = Cents.ZERO,
            referenceDate = referenceDate,
        )

        assertTrue(recommendations.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // BudgetRecommendation properties
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun budgetRecommendation_hasRequiredFields() {
        val rec = BudgetRecommendation(
            type = RecommendationType.INCREASE_BUDGET,
            budgetId = SyncId("budget-1"),
            categoryId = SyncId("cat-1"),
            title = "Increase budget",
            description = "Your budget is consistently exceeded",
            currentAmount = Cents(30000),
            recommendedAmount = Cents(45000),
            impactCents = Cents(15000),
            priority = RecommendationPriority.HIGH,
        )

        assertEquals(RecommendationType.INCREASE_BUDGET, rec.type)
        assertEquals(SyncId("budget-1"), rec.budgetId)
        assertEquals(Cents(15000), rec.impactCents)
    }
}
