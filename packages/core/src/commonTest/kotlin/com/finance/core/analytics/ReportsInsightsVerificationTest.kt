// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.analytics

import com.finance.core.TestFixtures
import com.finance.core.aggregation.FinancialAggregator
import com.finance.models.AccountType
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate
import kotlinx.datetime.Month
import kotlin.test.*

/**
 * Sprint 2 verification tests for #1364 — Reports & Insights Calculations.
 *
 * Covers:
 * - Monthly income/expense summaries
 * - Category breakdown percentages
 * - Spending trends over time periods
 * - Year-over-year comparison logic
 * - Net worth calculation across accounts
 */
class ReportsInsightsVerificationTest {

    @BeforeTest
    fun setUp() {
        TestFixtures.reset()
    }

    // ═══════════════════════════════════════════════════════════════════
    // Monthly income/expense summaries
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun monthlyIncomeSummary_sumsAllIncomeInPeriod() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(500000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createIncome(amount = Cents(200000), date = LocalDate(2024, 6, 15)),
            TestFixtures.createIncome(amount = Cents(100000), date = LocalDate(2024, 5, 28)),
        )

        val income = FinancialAggregator.totalIncome(
            transactions,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 30),
        )

        assertEquals(Cents(700000), income, "June income = $5000 + $2000 = $7000")
    }

    @Test
    fun monthlyExpenseSummary_sumsAllExpensesInPeriod() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(15000), date = LocalDate(2024, 6, 5)),
            TestFixtures.createExpense(amount = Cents(25000), date = LocalDate(2024, 6, 10)),
            TestFixtures.createExpense(amount = Cents(35000), date = LocalDate(2024, 7, 1)),
        )

        val expense = FinancialAggregator.totalSpending(
            transactions,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 30),
        )

        assertEquals(Cents(40000), expense, "June expenses = $150 + $250 = $400")
    }

    @Test
    fun monthlyComparison_netIsIncomeMinusExpense() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(500000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createExpense(amount = Cents(300000), date = LocalDate(2024, 6, 15)),
        )

        val comparisons = ReportGenerator.incomeVsExpense(
            transactions,
            months = 1,
            referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(1, comparisons.size)
        val june = comparisons.first()
        assertEquals(Cents(500000), june.income)
        assertEquals(Cents(300000), june.expense)
        assertEquals(Cents(200000), june.net, "Net = income - expense = $2000")
    }

    @Test
    fun monthlyComparison_deletedTransactions_excluded() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(500000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createExpense(
                amount = Cents(100000),
                date = LocalDate(2024, 6, 10),
                deletedAt = TestFixtures.fixedInstant,
            ),
            TestFixtures.createExpense(amount = Cents(200000), date = LocalDate(2024, 6, 15)),
        )

        val expense = FinancialAggregator.totalSpending(
            transactions,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 30),
        )

        assertEquals(Cents(200000), expense, "Deleted transaction excluded")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Category breakdown percentages
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun categoryBreakdown_calculatesCorrectPercentages() {
        val catGroceries = SyncId("cat-groceries")
        val catDining = SyncId("cat-dining")
        val catTransport = SyncId("cat-transport")

        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(5000), categoryId = catGroceries, date = LocalDate(2024, 6, 5)),
            TestFixtures.createExpense(amount = Cents(3000), categoryId = catDining, date = LocalDate(2024, 6, 10)),
            TestFixtures.createExpense(amount = Cents(2000), categoryId = catTransport, date = LocalDate(2024, 6, 15)),
        )

        val byCategory = ReportGenerator.spendingByCategory(
            transactions,
            ReportGenerator.DateRange(LocalDate(2024, 6, 1), LocalDate(2024, 6, 30)),
        )

        val total = byCategory.values.sumOf { it.amount }
        assertEquals(10000L, total, "Total spending = $100")

        val groceryPct = (byCategory[catGroceries]!!.amount.toDouble() / total) * 100.0
        assertEquals(50.0, groceryPct, 0.01, "Groceries = 50%")

        val diningPct = (byCategory[catDining]!!.amount.toDouble() / total) * 100.0
        assertEquals(30.0, diningPct, 0.01, "Dining = 30%")

        val transportPct = (byCategory[catTransport]!!.amount.toDouble() / total) * 100.0
        assertEquals(20.0, transportPct, 0.01, "Transport = 20%")
    }

    @Test
    fun categoryBreakdown_uncategorizedTransactions_excluded() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(5000), categoryId = SyncId("cat-a"), date = LocalDate(2024, 6, 1)),
            TestFixtures.createExpense(amount = Cents(3000), categoryId = null, date = LocalDate(2024, 6, 5)),
        )

        val byCategory = ReportGenerator.spendingByCategory(
            transactions,
            ReportGenerator.DateRange(LocalDate(2024, 6, 1), LocalDate(2024, 6, 30)),
        )

        assertEquals(1, byCategory.size, "Uncategorized excluded from report")
        assertEquals(Cents(5000), byCategory[SyncId("cat-a")])
    }

    // ═══════════════════════════════════════════════════════════════════
    // Spending trends over time periods
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun spendingTrend_multipleMonths_chronologicalOrder() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 4, 15)),
            TestFixtures.createExpense(amount = Cents(15000), date = LocalDate(2024, 5, 15)),
            TestFixtures.createExpense(amount = Cents(20000), date = LocalDate(2024, 6, 15)),
        )

        val trend = FinancialAggregator.monthlySpendingTrend(
            transactions,
            months = 3,
            referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(3, trend.size)
        assertEquals(Month.APRIL, trend[0].month, "Oldest first")
        assertEquals(Month.MAY, trend[1].month)
        assertEquals(Month.JUNE, trend[2].month, "Most recent last")
        assertEquals(Cents(10000), trend[0].total)
        assertEquals(Cents(15000), trend[1].total)
        assertEquals(Cents(20000), trend[2].total)
    }

    @Test
    fun categoryTrend_isolatesSingleCategory() {
        val catGroceries = SyncId("cat-groceries")
        val catDining = SyncId("cat-dining")

        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(10000), categoryId = catGroceries, date = LocalDate(2024, 6, 5)),
            TestFixtures.createExpense(amount = Cents(5000), categoryId = catDining, date = LocalDate(2024, 6, 10)),
        )

        val trend = ReportGenerator.categoryTrends(
            transactions,
            categoryId = catGroceries,
            months = 1,
            referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(1, trend.size)
        assertEquals(Cents(10000), trend.first().total, "Only groceries transactions counted")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Year-over-year / month-over-month comparison
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun spendingInsights_detectsUpTrend() {
        val catId = SyncId("cat-groceries")
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(10000), categoryId = catId, date = LocalDate(2024, 5, 15)),
            TestFixtures.createExpense(amount = Cents(20000), categoryId = catId, date = LocalDate(2024, 6, 15)),
        )

        val insights = ReportGenerator.spendingInsights(
            transactions,
            referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(1, insights.size)
        assertEquals(Trend.UP, insights.first().trend)
        assertNotNull(insights.first().percentChange)
        assertTrue(insights.first().percentChange!! > 0, "Spending increased")
    }

    @Test
    fun spendingInsights_detectsDownTrend() {
        val catId = SyncId("cat-dining")
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(30000), categoryId = catId, date = LocalDate(2024, 5, 15)),
            TestFixtures.createExpense(amount = Cents(10000), categoryId = catId, date = LocalDate(2024, 6, 15)),
        )

        val insights = ReportGenerator.spendingInsights(
            transactions,
            referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(1, insights.size)
        assertEquals(Trend.DOWN, insights.first().trend)
        assertTrue(insights.first().percentChange!! < 0, "Spending decreased")
    }

    @Test
    fun spendingInsights_stableTrend_withinDeadband() {
        val catId = SyncId("cat-utilities")
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(10000), categoryId = catId, date = LocalDate(2024, 5, 15)),
            TestFixtures.createExpense(amount = Cents(10050), categoryId = catId, date = LocalDate(2024, 6, 15)),
        )

        val insights = ReportGenerator.spendingInsights(
            transactions,
            referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(1, insights.size)
        assertEquals(Trend.STABLE, insights.first().trend, "0.5% change is within ±1% dead-band")
    }

    @Test
    fun computeTrend_previousZero_currentNonzero_trendsUp() {
        val (pct, trend) = ReportGenerator.computeTrend(Cents(5000), Cents.ZERO)
        assertNull(pct, "Percent change undefined when previous is zero")
        assertEquals(Trend.UP, trend)
    }

    @Test
    fun computeTrend_bothZero_stable() {
        val (pct, trend) = ReportGenerator.computeTrend(Cents.ZERO, Cents.ZERO)
        assertNull(pct)
        assertEquals(Trend.STABLE, trend)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Net worth calculation across accounts
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun netWorth_checkingAndSavings_sumsPositive() {
        val accounts = listOf(
            TestFixtures.createAccount(name = "Checking", type = AccountType.CHECKING, currentBalance = Cents(150000)),
            TestFixtures.createAccount(name = "Savings", type = AccountType.SAVINGS, currentBalance = Cents(500000)),
        )

        val nw = FinancialAggregator.netWorth(accounts)
        assertEquals(Cents(650000), nw, "Net worth = $1500 + $5000 = $6500")
    }

    @Test
    fun netWorth_creditCardSubtracted() {
        val accounts = listOf(
            TestFixtures.createAccount(name = "Checking", type = AccountType.CHECKING, currentBalance = Cents(500000)),
            TestFixtures.createAccount(name = "CC", type = AccountType.CREDIT_CARD, currentBalance = Cents(150000)),
        )

        val nw = FinancialAggregator.netWorth(accounts)
        assertEquals(Cents(350000), nw, "Net worth = $5000 - $1500 = $3500")
    }

    @Test
    fun netWorth_loanSubtracted() {
        val accounts = listOf(
            TestFixtures.createAccount(name = "Savings", type = AccountType.SAVINGS, currentBalance = Cents(1000000)),
            TestFixtures.createAccount(name = "Car Loan", type = AccountType.LOAN, currentBalance = Cents(2000000)),
        )

        val nw = FinancialAggregator.netWorth(accounts)
        assertEquals(Cents(-1000000), nw, "Net worth can be negative: $10000 - $20000 = -$10000")
    }

    @Test
    fun netWorth_archivedAccountsExcluded() {
        val accounts = listOf(
            TestFixtures.createAccount(name = "Active", currentBalance = Cents(100000)),
            TestFixtures.createAccount(name = "Archived", currentBalance = Cents(500000), isArchived = true),
        )

        val nw = FinancialAggregator.netWorth(accounts)
        assertEquals(Cents(100000), nw, "Archived account excluded")
    }

    @Test
    fun netWorth_deletedAccountsExcluded() {
        val accounts = listOf(
            TestFixtures.createAccount(name = "Active", currentBalance = Cents(100000)),
            TestFixtures.createAccount(
                name = "Deleted",
                currentBalance = Cents(500000),
                deletedAt = TestFixtures.fixedInstant,
            ),
        )

        val nw = FinancialAggregator.netWorth(accounts)
        assertEquals(Cents(100000), nw, "Deleted account excluded")
    }

    @Test
    fun netWorthOverTime_singleMonth_usesCurrentBalances() {
        val accounts = listOf(
            TestFixtures.createAccount(type = AccountType.CHECKING, currentBalance = Cents(500000)),
        )

        val snapshots = ReportGenerator.netWorthOverTime(
            accounts,
            transactions = emptyList(),
            months = 1,
            referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(1, snapshots.size)
        assertEquals(Cents(500000), snapshots.first().netWorth)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Savings rate
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun savingsRate_calculatedCorrectly() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(500000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createExpense(amount = Cents(400000), date = LocalDate(2024, 6, 15)),
        )

        val rate = FinancialAggregator.savingsRate(
            transactions,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 30),
        )

        assertEquals(20.0, rate, 0.01, "Savings rate = ($5000 - $4000) / $5000 = 20%")
    }

    @Test
    fun savingsRate_noIncome_returnsZero() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(100000), date = LocalDate(2024, 6, 1)),
        )

        val rate = FinancialAggregator.savingsRate(
            transactions,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 30),
        )

        assertEquals(0.0, rate, "Savings rate with no income = 0%")
    }
}
