// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.analytics

import com.finance.core.TestFixtures
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.datetime.*
import kotlin.test.*

class ReportGeneratorTest {

    @BeforeTest
    fun setUp() {
        TestFixtures.reset()
    }

    // ═══════════════════════════════════════════════════════════════════
    // spendingByCategory()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun spendingByCategory_groupsByCategory() {
        val food = SyncId("cat-food")
        val transport = SyncId("cat-transport")
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(1500), categoryId = food,
                date = LocalDate(2024, 6, 5),
            ),
            TestFixtures.createExpense(
                amount = Cents(2500), categoryId = food,
                date = LocalDate(2024, 6, 10),
            ),
            TestFixtures.createExpense(
                amount = Cents(3000), categoryId = transport,
                date = LocalDate(2024, 6, 12),
            ),
        )
        val range = ReportGenerator.DateRange(
            LocalDate(2024, 6, 1), LocalDate(2024, 6, 30),
        )

        val result = ReportGenerator.spendingByCategory(transactions, range)

        assertEquals(2, result.size)
        assertEquals(Cents(4000), result[food])
        assertEquals(Cents(3000), result[transport])
    }

    @Test
    fun spendingByCategory_excludesUncategorised() {
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(1000), categoryId = null,
                date = LocalDate(2024, 6, 5),
            ),
            TestFixtures.createExpense(
                amount = Cents(2000), categoryId = SyncId("cat-1"),
                date = LocalDate(2024, 6, 5),
            ),
        )
        val range = ReportGenerator.DateRange(
            LocalDate(2024, 6, 1), LocalDate(2024, 6, 30),
        )

        val result = ReportGenerator.spendingByCategory(transactions, range)

        assertEquals(1, result.size)
        assertEquals(Cents(2000), result[SyncId("cat-1")])
    }

    @Test
    fun spendingByCategory_emptyTransactions_returnsEmptyMap() {
        val range = ReportGenerator.DateRange(
            LocalDate(2024, 6, 1), LocalDate(2024, 6, 30),
        )

        val result = ReportGenerator.spendingByCategory(emptyList(), range)

        assertTrue(result.isEmpty())
    }

    @Test
    fun spendingByCategory_excludesDeletedAndVoid() {
        val cat = SyncId("cat-1")
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(1000), categoryId = cat,
                date = LocalDate(2024, 6, 5),
            ),
            TestFixtures.createExpense(
                amount = Cents(2000), categoryId = cat,
                date = LocalDate(2024, 6, 6),
                deletedAt = TestFixtures.fixedInstant,
            ),
            TestFixtures.createExpense(
                amount = Cents(3000), categoryId = cat,
                date = LocalDate(2024, 6, 7),
                status = TransactionStatus.VOID,
            ),
        )
        val range = ReportGenerator.DateRange(
            LocalDate(2024, 6, 1), LocalDate(2024, 6, 30),
        )

        val result = ReportGenerator.spendingByCategory(transactions, range)

        assertEquals(Cents(1000), result[cat])
    }

    @Test
    fun spendingByCategory_excludesTransactionsOutsideDateRange() {
        val cat = SyncId("cat-1")
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(1000), categoryId = cat,
                date = LocalDate(2024, 5, 31),
            ),
            TestFixtures.createExpense(
                amount = Cents(2000), categoryId = cat,
                date = LocalDate(2024, 6, 15),
            ),
            TestFixtures.createExpense(
                amount = Cents(3000), categoryId = cat,
                date = LocalDate(2024, 7, 1),
            ),
        )
        val range = ReportGenerator.DateRange(
            LocalDate(2024, 6, 1), LocalDate(2024, 6, 30),
        )

        val result = ReportGenerator.spendingByCategory(transactions, range)

        assertEquals(Cents(2000), result[cat])
    }

    // ═══════════════════════════════════════════════════════════════════
    // incomeVsExpense()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun incomeVsExpense_singleMonth() {
        val transactions = listOf(
            TestFixtures.createIncome(
                amount = Cents(500000), date = LocalDate(2024, 6, 1),
            ),
            TestFixtures.createExpense(
                amount = Cents(200000), date = LocalDate(2024, 6, 15),
            ),
            TestFixtures.createExpense(
                amount = Cents(100000), date = LocalDate(2024, 6, 20),
            ),
        )

        val result = ReportGenerator.incomeVsExpense(
            transactions, months = 1, referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(1, result.size)
        val june = result[0]
        assertEquals(2024, june.year)
        assertEquals(Month.JUNE, june.month)
        assertEquals(Cents(500000), june.income)
        assertEquals(Cents(300000), june.expense)
        assertEquals(Cents(200000), june.net)
    }

    @Test
    fun incomeVsExpense_multipleMonths_orderedChronologically() {
        val transactions = listOf(
            TestFixtures.createIncome(
                amount = Cents(400000), date = LocalDate(2024, 4, 10),
            ),
            TestFixtures.createExpense(
                amount = Cents(350000), date = LocalDate(2024, 4, 15),
            ),
            TestFixtures.createIncome(
                amount = Cents(500000), date = LocalDate(2024, 5, 1),
            ),
            TestFixtures.createExpense(
                amount = Cents(200000), date = LocalDate(2024, 5, 20),
            ),
            TestFixtures.createIncome(
                amount = Cents(600000), date = LocalDate(2024, 6, 5),
            ),
            TestFixtures.createExpense(
                amount = Cents(250000), date = LocalDate(2024, 6, 25),
            ),
        )

        val result = ReportGenerator.incomeVsExpense(
            transactions, months = 3, referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(3, result.size)
        // First = oldest (April)
        assertEquals(Month.APRIL, result[0].month)
        assertEquals(Cents(400000), result[0].income)
        assertEquals(Cents(350000), result[0].expense)
        assertEquals(Cents(50000), result[0].net)
        // Last = most recent (June)
        assertEquals(Month.JUNE, result[2].month)
        assertEquals(Cents(600000), result[2].income)
        assertEquals(Cents(250000), result[2].expense)
        assertEquals(Cents(350000), result[2].net)
    }

    @Test
    fun incomeVsExpense_monthWithNoTransactions_returnsZeros() {
        val transactions = listOf(
            TestFixtures.createIncome(
                amount = Cents(500000), date = LocalDate(2024, 6, 1),
            ),
        )

        val result = ReportGenerator.incomeVsExpense(
            transactions, months = 3, referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(3, result.size)
        // April and May should be zero
        assertEquals(Cents.ZERO, result[0].income)
        assertEquals(Cents.ZERO, result[0].expense)
        assertEquals(Cents.ZERO, result[0].net)
        assertEquals(Cents.ZERO, result[1].income)
        assertEquals(Cents.ZERO, result[1].expense)
        assertEquals(Cents.ZERO, result[1].net)
        // June has data
        assertEquals(Cents(500000), result[2].income)
    }

    @Test
    fun incomeVsExpense_emptyTransactions() {
        val result = ReportGenerator.incomeVsExpense(
            emptyList(), months = 2, referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(2, result.size)
        result.forEach { comparison ->
            assertEquals(Cents.ZERO, comparison.income)
            assertEquals(Cents.ZERO, comparison.expense)
            assertEquals(Cents.ZERO, comparison.net)
        }
    }

    @Test
    fun incomeVsExpense_negativeNet_whenExpensesExceedIncome() {
        val transactions = listOf(
            TestFixtures.createIncome(
                amount = Cents(100000), date = LocalDate(2024, 6, 1),
            ),
            TestFixtures.createExpense(
                amount = Cents(300000), date = LocalDate(2024, 6, 15),
            ),
        )

        val result = ReportGenerator.incomeVsExpense(
            transactions, months = 1, referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(Cents(-200000), result[0].net)
    }

    @Test
    fun incomeVsExpense_invalidMonths_throws() {
        assertFailsWith<IllegalArgumentException> {
            ReportGenerator.incomeVsExpense(emptyList(), months = 0)
        }
        assertFailsWith<IllegalArgumentException> {
            ReportGenerator.incomeVsExpense(emptyList(), months = -1)
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // netWorthOverTime()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun netWorthOverTime_singleMonth_usesCurrentBalances() {
        val accounts = listOf(
            TestFixtures.createAccount(
                type = AccountType.CHECKING, currentBalance = Cents(500000),
            ),
            TestFixtures.createAccount(
                type = AccountType.CREDIT_CARD, currentBalance = Cents(50000),
            ),
        )

        val result = ReportGenerator.netWorthOverTime(
            accounts, emptyList(), months = 1,
            referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(1, result.size)
        assertEquals(Cents(500000), result[0].totalAssets)
        assertEquals(Cents(50000), result[0].totalLiabilities)
        assertEquals(Cents(450000), result[0].netWorth)
    }

    @Test
    fun netWorthOverTime_multipleMonths_orderedChronologically() {
        val accounts = listOf(
            TestFixtures.createAccount(
                type = AccountType.CHECKING, currentBalance = Cents(500000),
            ),
        )
        val transactions = listOf(
            TestFixtures.createIncome(
                amount = Cents(100000), date = LocalDate(2024, 6, 10),
            ),
            TestFixtures.createExpense(
                amount = Cents(50000), date = LocalDate(2024, 6, 15),
            ),
        )

        val result = ReportGenerator.netWorthOverTime(
            accounts, transactions, months = 2,
            referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(2, result.size)
        // Most recent month is last (June)
        assertEquals(Cents(500000), result[1].netWorth)
        // Previous month (May) = current - June's net cash flow
        // June net = income(100000) - expense(50000) = 50000
        assertEquals(Cents(450000), result[0].netWorth)
    }

    @Test
    fun netWorthOverTime_emptyAccounts_allZero() {
        val result = ReportGenerator.netWorthOverTime(
            emptyList(), emptyList(), months = 1,
            referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(1, result.size)
        assertEquals(Cents.ZERO, result[0].netWorth)
        assertEquals(Cents.ZERO, result[0].totalAssets)
        assertEquals(Cents.ZERO, result[0].totalLiabilities)
    }

    @Test
    fun netWorthOverTime_invalidMonths_throws() {
        assertFailsWith<IllegalArgumentException> {
            ReportGenerator.netWorthOverTime(
                emptyList(), emptyList(), months = 0,
            )
        }
    }

    @Test
    fun netWorthOverTime_excludesArchivedAndDeletedAccounts() {
        val accounts = listOf(
            TestFixtures.createAccount(
                type = AccountType.CHECKING, currentBalance = Cents(500000),
            ),
            TestFixtures.createAccount(
                type = AccountType.SAVINGS, currentBalance = Cents(200000),
                isArchived = true,
            ),
            TestFixtures.createAccount(
                type = AccountType.CHECKING, currentBalance = Cents(100000),
                deletedAt = TestFixtures.fixedInstant,
            ),
        )

        val result = ReportGenerator.netWorthOverTime(
            accounts, emptyList(), months = 1,
            referenceDate = LocalDate(2024, 6, 15),
        )

        // FinancialAggregator.netWorth excludes archived/deleted
        assertEquals(Cents(500000), result[0].netWorth)
        assertEquals(Cents(500000), result[0].totalAssets)
        assertEquals(Cents.ZERO, result[0].totalLiabilities)
    }

    // ═══════════════════════════════════════════════════════════════════
    // categoryTrends()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun categoryTrends_filtersByCategory() {
        val food = SyncId("cat-food")
        val transport = SyncId("cat-transport")
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(1500), categoryId = food,
                date = LocalDate(2024, 6, 5),
            ),
            TestFixtures.createExpense(
                amount = Cents(3000), categoryId = transport,
                date = LocalDate(2024, 6, 12),
            ),
            TestFixtures.createExpense(
                amount = Cents(2000), categoryId = food,
                date = LocalDate(2024, 5, 10),
            ),
        )

        val result = ReportGenerator.categoryTrends(
            transactions, categoryId = food, months = 2,
            referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(2, result.size)
        // May (older first)
        assertEquals(Month.MAY, result[0].month)
        assertEquals(Cents(2000), result[0].total)
        // June
        assertEquals(Month.JUNE, result[1].month)
        assertEquals(Cents(1500), result[1].total)
    }

    @Test
    fun categoryTrends_noneForCategory_allZero() {
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(1500), categoryId = SyncId("other"),
                date = LocalDate(2024, 6, 5),
            ),
        )

        val result = ReportGenerator.categoryTrends(
            transactions, categoryId = SyncId("target"), months = 2,
            referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(2, result.size)
        result.forEach { assertEquals(Cents.ZERO, it.total) }
    }

    @Test
    fun categoryTrends_invalidMonths_throws() {
        assertFailsWith<IllegalArgumentException> {
            ReportGenerator.categoryTrends(
                emptyList(), SyncId("cat-1"), months = 0,
            )
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // spendingInsights()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun spendingInsights_calculatesPercentChangeAndTrend() {
        val food = SyncId("cat-food")
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(10000), categoryId = food,
                date = LocalDate(2024, 5, 10),
            ),
            TestFixtures.createExpense(
                amount = Cents(15000), categoryId = food,
                date = LocalDate(2024, 6, 10),
            ),
        )

        val result = ReportGenerator.spendingInsights(
            transactions, referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(1, result.size)
        val insight = result[0]
        assertEquals(food, insight.categoryId)
        assertEquals(Cents(15000), insight.currentMonth)
        assertEquals(Cents(10000), insight.previousMonth)
        assertEquals(50.0, insight.percentChange!!, 0.01)
        assertEquals(Trend.UP, insight.trend)
    }

    @Test
    fun spendingInsights_decreasedSpending_trendDown() {
        val cat = SyncId("cat-1")
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(20000), categoryId = cat,
                date = LocalDate(2024, 5, 10),
            ),
            TestFixtures.createExpense(
                amount = Cents(10000), categoryId = cat,
                date = LocalDate(2024, 6, 10),
            ),
        )

        val result = ReportGenerator.spendingInsights(
            transactions, referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(1, result.size)
        assertEquals(Trend.DOWN, result[0].trend)
        assertEquals(-50.0, result[0].percentChange!!, 0.01)
    }

    @Test
    fun spendingInsights_similarSpending_trendStable() {
        val cat = SyncId("cat-1")
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(10000), categoryId = cat,
                date = LocalDate(2024, 5, 10),
            ),
            TestFixtures.createExpense(
                amount = Cents(10050), categoryId = cat,
                date = LocalDate(2024, 6, 10),
            ),
        )

        val result = ReportGenerator.spendingInsights(
            transactions, referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(1, result.size)
        assertEquals(Trend.STABLE, result[0].trend)
    }

    @Test
    fun spendingInsights_noPreviousMonth_percentChangeNull_trendUp() {
        val cat = SyncId("cat-1")
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(10000), categoryId = cat,
                date = LocalDate(2024, 6, 10),
            ),
        )

        val result = ReportGenerator.spendingInsights(
            transactions, referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(1, result.size)
        assertNull(result[0].percentChange)
        assertEquals(Trend.UP, result[0].trend)
    }

    @Test
    fun spendingInsights_noCurrentMonth_percentChangeNegative100() {
        val cat = SyncId("cat-1")
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(10000), categoryId = cat,
                date = LocalDate(2024, 5, 10),
            ),
        )

        val result = ReportGenerator.spendingInsights(
            transactions, referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(1, result.size)
        assertEquals(-100.0, result[0].percentChange!!, 0.01)
        assertEquals(Trend.DOWN, result[0].trend)
    }

    @Test
    fun spendingInsights_noTransactions_returnsEmptyList() {
        val result = ReportGenerator.spendingInsights(
            emptyList(), referenceDate = LocalDate(2024, 6, 15),
        )

        assertTrue(result.isEmpty())
    }

    @Test
    fun spendingInsights_multipleCategories_sortedByAbsPercentChange() {
        val food = SyncId("cat-food")
        val transport = SyncId("cat-transport")
        val transactions = listOf(
            // Food: $100 → $200 = +100%
            TestFixtures.createExpense(
                amount = Cents(10000), categoryId = food,
                date = LocalDate(2024, 5, 10),
            ),
            TestFixtures.createExpense(
                amount = Cents(20000), categoryId = food,
                date = LocalDate(2024, 6, 10),
            ),
            // Transport: $200 → $150 = -25%
            TestFixtures.createExpense(
                amount = Cents(20000), categoryId = transport,
                date = LocalDate(2024, 5, 10),
            ),
            TestFixtures.createExpense(
                amount = Cents(15000), categoryId = transport,
                date = LocalDate(2024, 6, 10),
            ),
        )

        val result = ReportGenerator.spendingInsights(
            transactions, referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(2, result.size)
        // Food (+100%) should be first (highest absolute change)
        assertEquals(food, result[0].categoryId)
        assertEquals(transport, result[1].categoryId)
    }

    // ═══════════════════════════════════════════════════════════════════
    // computeTrend() — internal helper
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun computeTrend_bothZero_stable() {
        val (pct, trend) = ReportGenerator.computeTrend(
            Cents.ZERO, Cents.ZERO,
        )
        assertNull(pct)
        assertEquals(Trend.STABLE, trend)
    }

    @Test
    fun computeTrend_previousZero_currentPositive_up() {
        val (pct, trend) = ReportGenerator.computeTrend(
            Cents(1000), Cents.ZERO,
        )
        assertNull(pct)
        assertEquals(Trend.UP, trend)
    }

    @Test
    fun computeTrend_increase_up() {
        val (pct, trend) = ReportGenerator.computeTrend(
            Cents(15000), Cents(10000),
        )
        assertNotNull(pct)
        assertEquals(50.0, pct, 0.01)
        assertEquals(Trend.UP, trend)
    }

    @Test
    fun computeTrend_decrease_down() {
        val (pct, trend) = ReportGenerator.computeTrend(
            Cents(5000), Cents(10000),
        )
        assertNotNull(pct)
        assertEquals(-50.0, pct, 0.01)
        assertEquals(Trend.DOWN, trend)
    }

    @Test
    fun computeTrend_withinDeadBand_stable() {
        // 0.5% change — within ±1% dead-band
        val (pct, trend) = ReportGenerator.computeTrend(
            Cents(10050), Cents(10000),
        )
        assertNotNull(pct)
        assertEquals(Trend.STABLE, trend)
    }

    // ═══════════════════════════════════════════════════════════════════
    // DateRange validation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun dateRange_validRange_succeeds() {
        val range = ReportGenerator.DateRange(
            LocalDate(2024, 1, 1), LocalDate(2024, 12, 31),
        )
        assertEquals(LocalDate(2024, 1, 1), range.start)
        assertEquals(LocalDate(2024, 12, 31), range.endInclusive)
    }

    @Test
    fun dateRange_sameDay_succeeds() {
        val range = ReportGenerator.DateRange(
            LocalDate(2024, 6, 15), LocalDate(2024, 6, 15),
        )
        assertEquals(range.start, range.endInclusive)
    }

    @Test
    fun dateRange_endBeforeStart_throws() {
        assertFailsWith<IllegalArgumentException> {
            ReportGenerator.DateRange(
                LocalDate(2024, 6, 15), LocalDate(2024, 6, 1),
            )
        }
    }
}
