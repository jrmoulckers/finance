// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.insights

import com.finance.core.TestFixtures
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.datetime.*
import kotlin.test.*

class InsightsEngineTest {

    private val referenceDate = LocalDate(2024, 6, 15)

    @BeforeTest
    fun setUp() {
        TestFixtures.reset()
    }

    // ═══════════════════════════════════════════════════════════════════
    // Category Trends
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun categoryTrends_detectsIncreasingTrend() {
        val catId = SyncId("cat-dining")

        // Build increasing spending pattern: $100, $150, $200, $250, $300, $350
        val transactions = (0 until 6).flatMap { offset ->
            val monthDate = referenceDate.minus(offset, DateTimeUnit.MONTH)
            val amount = Cents((35000L - offset * 5000L)) // most recent is highest
            listOf(
                TestFixtures.createExpense(
                    amount = amount,
                    date = LocalDate(monthDate.year, monthDate.month, 10),
                    categoryId = catId,
                ),
            )
        }

        val trends = InsightsEngine.categoryTrends(transactions, 6, referenceDate)

        assertEquals(1, trends.size)
        val trend = trends.first()
        assertEquals(catId, trend.categoryId)
        assertEquals(6, trend.monthlyAmounts.size)
        assertEquals(TrendDirection.INCREASING, trend.direction)
        assertTrue(trend.averageMonthly.isPositive())
    }

    @Test
    fun categoryTrends_detectsDecreasingTrend() {
        val catId = SyncId("cat-transport")

        // Decreasing spending: oldest is highest
        val transactions = (0 until 6).flatMap { offset ->
            val monthDate = referenceDate.minus(offset, DateTimeUnit.MONTH)
            val amount = Cents(10000L + offset * 5000L) // oldest has highest spending
            listOf(
                TestFixtures.createExpense(
                    amount = amount,
                    date = LocalDate(monthDate.year, monthDate.month, 10),
                    categoryId = catId,
                ),
            )
        }

        val trends = InsightsEngine.categoryTrends(transactions, 6, referenceDate)

        assertEquals(1, trends.size)
        assertEquals(TrendDirection.DECREASING, trends.first().direction)
    }

    @Test
    fun categoryTrends_stableSpending() {
        val catId = SyncId("cat-utilities")

        // Same amount each month → stable
        val transactions = (0 until 6).flatMap { offset ->
            val monthDate = referenceDate.minus(offset, DateTimeUnit.MONTH)
            listOf(
                TestFixtures.createExpense(
                    amount = Cents(15000),
                    date = LocalDate(monthDate.year, monthDate.month, 10),
                    categoryId = catId,
                ),
            )
        }

        val trends = InsightsEngine.categoryTrends(transactions, 6, referenceDate)

        assertEquals(1, trends.size)
        assertEquals(TrendDirection.STABLE, trends.first().direction)
    }

    @Test
    fun categoryTrends_emptyTransactions() {
        val trends = InsightsEngine.categoryTrends(emptyList(), 6, referenceDate)
        assertTrue(trends.isEmpty())
    }

    @Test
    fun categoryTrends_sortedByAverageDescending() {
        val catHigh = SyncId("cat-high")
        val catLow = SyncId("cat-low")

        val transactions = (0 until 3).flatMap { offset ->
            val monthDate = referenceDate.minus(offset, DateTimeUnit.MONTH)
            listOf(
                TestFixtures.createExpense(
                    amount = Cents(50000),
                    date = LocalDate(monthDate.year, monthDate.month, 10),
                    categoryId = catHigh,
                ),
                TestFixtures.createExpense(
                    amount = Cents(10000),
                    date = LocalDate(monthDate.year, monthDate.month, 10),
                    categoryId = catLow,
                ),
            )
        }

        val trends = InsightsEngine.categoryTrends(transactions, 3, referenceDate)

        assertEquals(2, trends.size)
        assertEquals(catHigh, trends[0].categoryId)
        assertEquals(catLow, trends[1].categoryId)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Category Analysis
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun categoryAnalysis_ranksCorrectly() {
        val catA = SyncId("cat-a")
        val catB = SyncId("cat-b")

        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(30000), date = LocalDate(2024, 6, 5), categoryId = catA,
            ),
            TestFixtures.createExpense(
                amount = Cents(10000), date = LocalDate(2024, 6, 10), categoryId = catB,
            ),
        )

        val analysis = InsightsEngine.categoryAnalysis(transactions, referenceDate)

        assertEquals(2, analysis.size)
        assertEquals(1, analysis[0].rank)
        assertEquals(catA, analysis[0].categoryId)
        assertEquals(2, analysis[1].rank)
        assertEquals(catB, analysis[1].categoryId)
    }

    @Test
    fun categoryAnalysis_percentOfTotal() {
        val catA = SyncId("cat-a")
        val catB = SyncId("cat-b")

        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(75000), date = LocalDate(2024, 6, 5), categoryId = catA,
            ),
            TestFixtures.createExpense(
                amount = Cents(25000), date = LocalDate(2024, 6, 10), categoryId = catB,
            ),
        )

        val analysis = InsightsEngine.categoryAnalysis(transactions, referenceDate)

        assertEquals(75.0, analysis[0].percentOfTotal)
        assertEquals(25.0, analysis[1].percentOfTotal)
    }

    @Test
    fun categoryAnalysis_changePercentVsPrior() {
        val catA = SyncId("cat-a")

        val transactions = listOf(
            // Prior month: $100
            TestFixtures.createExpense(
                amount = Cents(10000), date = LocalDate(2024, 5, 10), categoryId = catA,
            ),
            // Current month: $200
            TestFixtures.createExpense(
                amount = Cents(20000), date = LocalDate(2024, 6, 10), categoryId = catA,
            ),
        )

        val analysis = InsightsEngine.categoryAnalysis(transactions, referenceDate)

        assertEquals(1, analysis.size)
        assertNotNull(analysis[0].changePercent)
        assertEquals(100.0, analysis[0].changePercent!!, 0.01)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Income vs Expense Summary
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun incomeExpenseSummary_computesCorrectly() {
        val transactions = listOf(
            TestFixtures.createIncome(
                amount = Cents(500000), date = LocalDate(2024, 6, 1),
            ),
            TestFixtures.createExpense(
                amount = Cents(300000), date = LocalDate(2024, 6, 10),
                categoryId = SyncId("cat-a"),
            ),
            TestFixtures.createExpense(
                amount = Cents(100000), date = LocalDate(2024, 6, 15),
                categoryId = SyncId("cat-b"),
            ),
        )

        val summary = InsightsEngine.incomeExpenseSummary(transactions, referenceDate)

        assertEquals(Cents(500000), summary.totalIncome)
        assertEquals(Cents(400000), summary.totalExpenses)
        assertEquals(Cents(100000), summary.netCashFlow)
        assertEquals(20.0, summary.savingsRate, 0.1)
        assertTrue(summary.topExpenseCategories.isNotEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // Financial Health Score
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun calculateHealthScore_excellentFinances() {
        val transactions = listOf(
            TestFixtures.createIncome(
                amount = Cents(1000000), date = LocalDate(2024, 6, 1),
            ),
            TestFixtures.createExpense(
                amount = Cents(500000), date = LocalDate(2024, 6, 10),
                categoryId = SyncId("cat-a"),
            ),
            // Prior month for trend: similar spending
            TestFixtures.createIncome(
                amount = Cents(1000000), date = LocalDate(2024, 5, 1),
            ),
            TestFixtures.createExpense(
                amount = Cents(500000), date = LocalDate(2024, 5, 10),
                categoryId = SyncId("cat-a"),
            ),
        )

        val accounts = listOf(
            TestFixtures.createAccount(
                type = AccountType.CHECKING,
                currentBalance = Cents(500000),
            ),
            TestFixtures.createAccount(
                type = AccountType.SAVINGS,
                currentBalance = Cents(3000000), // $30k savings = 6 months
            ),
        )

        val budgets = listOf(
            TestFixtures.createBudget(
                categoryId = SyncId("cat-a"),
                amount = Cents(600000), // $6,000 budget, $5,000 spent → within
            ),
        )

        val score = InsightsEngine.calculateHealthScore(
            transactions, accounts, budgets, referenceDate,
        )

        assertTrue(score.overallScore >= 60)
        assertEquals(5, score.components.size)
        assertTrue(
            score.assessment == HealthAssessment.EXCELLENT ||
                score.assessment == HealthAssessment.GOOD,
        )
    }

    @Test
    fun calculateHealthScore_poorFinances() {
        val transactions = listOf(
            TestFixtures.createIncome(
                amount = Cents(200000), date = LocalDate(2024, 6, 1),
            ),
            TestFixtures.createExpense(
                amount = Cents(300000), date = LocalDate(2024, 6, 10),
                categoryId = SyncId("cat-a"),
            ),
            // Higher spending last month too
            TestFixtures.createExpense(
                amount = Cents(100000), date = LocalDate(2024, 5, 10),
                categoryId = SyncId("cat-a"),
            ),
        )

        val accounts = listOf(
            TestFixtures.createAccount(
                type = AccountType.CHECKING,
                currentBalance = Cents(10000),
            ),
            TestFixtures.createAccount(
                type = AccountType.CREDIT_CARD,
                currentBalance = Cents(500000), // $5,000 credit card debt
            ),
        )

        val score = InsightsEngine.calculateHealthScore(
            transactions, accounts, emptyList(), referenceDate,
        )

        assertTrue(score.overallScore < 50)
        assertTrue(
            score.assessment == HealthAssessment.NEEDS_ATTENTION ||
                score.assessment == HealthAssessment.CRITICAL ||
                score.assessment == HealthAssessment.FAIR,
        )
    }

    @Test
    fun calculateHealthScore_scoreInRange() {
        val score = InsightsEngine.calculateHealthScore(
            emptyList(), emptyList(), emptyList(), referenceDate,
        )

        assertTrue(score.overallScore in 0..100)
        assertEquals(5, score.components.size)
        score.components.forEach { component ->
            assertTrue(component.score in 0..100)
            assertTrue(component.weight > 0)
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Health Components
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun savingsRateComponent_highRate() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(500000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createExpense(amount = Cents(250000), date = LocalDate(2024, 6, 10)),
        )

        val component = InsightsEngine.savingsRateComponent(transactions, referenceDate)

        assertEquals("Savings Rate", component.name)
        assertEquals(30, component.weight)
        assertTrue(component.score >= 50) // 50% savings rate → high score
    }

    @Test
    fun budgetAdherenceComponent_noBudgets() {
        val component = InsightsEngine.budgetAdherenceComponent(
            emptyList(), emptyList(), referenceDate,
        )

        assertEquals(50, component.score) // Neutral
    }

    @Test
    fun debtRatioComponent_noDebt() {
        val accounts = listOf(
            TestFixtures.createAccount(
                type = AccountType.CHECKING,
                currentBalance = Cents(500000),
            ),
        )

        val component = InsightsEngine.debtRatioComponent(accounts)

        assertEquals(100, component.score) // No debt = perfect
    }

    @Test
    fun debtRatioComponent_highDebt() {
        val accounts = listOf(
            TestFixtures.createAccount(
                type = AccountType.CHECKING,
                currentBalance = Cents(100000),
            ),
            TestFixtures.createAccount(
                type = AccountType.CREDIT_CARD,
                currentBalance = Cents(80000),
            ),
        )

        val component = InsightsEngine.debtRatioComponent(accounts)

        assertTrue(component.score < 50) // 80% debt ratio
    }

    @Test
    fun emergencyFundComponent_adequate() {
        val accounts = listOf(
            TestFixtures.createAccount(
                type = AccountType.SAVINGS,
                currentBalance = Cents(3000000), // $30k
            ),
        )
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(500000), // $5k monthly
                date = LocalDate(2024, 6, 10),
            ),
        )

        val component = InsightsEngine.emergencyFundComponent(
            accounts, transactions, referenceDate,
        )

        assertEquals(100, component.score) // 6 months covered
    }

    @Test
    fun emergencyFundComponent_insufficient() {
        val accounts = listOf(
            TestFixtures.createAccount(
                type = AccountType.SAVINGS,
                currentBalance = Cents(100000), // $1k
            ),
        )
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(500000), // $5k monthly
                date = LocalDate(2024, 6, 10),
            ),
        )

        val component = InsightsEngine.emergencyFundComponent(
            accounts, transactions, referenceDate,
        )

        assertTrue(component.score < 10) // 0.2 months covered
    }

    // ═══════════════════════════════════════════════════════════════════
    // InsightTypes validation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun financialHealthScore_rejectsOutOfRange() {
        assertFailsWith<IllegalArgumentException> {
            FinancialHealthScore(101, emptyList(), HealthAssessment.EXCELLENT)
        }
        assertFailsWith<IllegalArgumentException> {
            FinancialHealthScore(-1, emptyList(), HealthAssessment.CRITICAL)
        }
    }

    @Test
    fun healthComponent_rejectsInvalidScore() {
        assertFailsWith<IllegalArgumentException> {
            HealthComponent("Test", 101, 10, "Bad")
        }
    }

    @Test
    fun healthComponent_rejectsZeroWeight() {
        assertFailsWith<IllegalArgumentException> {
            HealthComponent("Test", 50, 0, "Bad")
        }
    }
}
