package com.finance.core.benchmark

import com.finance.core.TestFixtures
import com.finance.core.aggregation.FinancialAggregator
import com.finance.core.budget.BudgetCalculator
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.datetime.*
import kotlin.test.Test
import kotlin.test.assertTrue
import kotlin.time.Duration
import kotlin.time.measureTime

/**
 * Performance benchmarks for [FinancialAggregator] and [BudgetCalculator].
 *
 * These tests verify that aggregation and budget calculations remain
 * performant with realistic dataset sizes (10K+ transactions, 100+ accounts).
 *
 * Targets (edge-first — all computations run on-device):
 * - Net worth (100 accounts): <10ms
 * - Total spending (10K transactions): <50ms
 * - Spending by category (10K transactions): <100ms
 * - Monthly trend (10K transactions, 12 months): <100ms
 * - Budget status (500 transactions): <10ms
 */
class AggregationBenchmark {

    companion object {
        private const val TRANSACTION_COUNT = 10_000
        private const val ACCOUNT_COUNT = 100
        private const val WARMUP_ITERATIONS = 20
        private const val BENCHMARK_ITERATIONS = 50

        private val START_DATE = LocalDate(2024, 1, 1)
        private val END_DATE = LocalDate(2024, 12, 31)
    }

    private fun generateTransactions(count: Int): List<Transaction> {
        TestFixtures.reset()
        val categories = (1..25).map { SyncId("category-$it") }
        val accounts = (1..10).map { SyncId("account-$it") }

        return (1..count).map { i ->
            val isExpense = i % 3 != 0
            val dayOffset = i % 365
            val date = START_DATE.plus(dayOffset, DateTimeUnit.DAY)

            if (isExpense) {
                TestFixtures.createExpense(
                    amount = Cents((i % 500 + 1).toLong() * 100),
                    date = date,
                    categoryId = categories[i % categories.size],
                    accountId = accounts[i % accounts.size],
                )
            } else {
                TestFixtures.createIncome(
                    amount = Cents((i % 2000 + 500).toLong() * 100),
                    date = date,
                    categoryId = categories[i % categories.size],
                    accountId = accounts[i % accounts.size],
                )
            }
        }
    }

    private fun generateAccounts(count: Int): List<Account> {
        TestFixtures.reset()
        val types = AccountType.entries

        return (1..count).map { i ->
            TestFixtures.createAccount(
                name = "Account $i",
                type = types[i % types.size],
                currentBalance = Cents((i * 10000 + 5000).toLong()),
            )
        }
    }

    @Test
    fun benchmarkNetWorth() {
        val accounts = generateAccounts(ACCOUNT_COUNT)

        repeat(WARMUP_ITERATIONS) { FinancialAggregator.netWorth(accounts) }

        val duration = measureTime {
            repeat(BENCHMARK_ITERATIONS) {
                FinancialAggregator.netWorth(accounts)
            }
        }

        printResult("netWorth($ACCOUNT_COUNT accounts) x$BENCHMARK_ITERATIONS", duration)
        assertTrue(
            duration.inWholeMilliseconds < 100,
            "netWorth x$BENCHMARK_ITERATIONS should complete in <100ms, took $duration",
        )
    }

    @Test
    fun benchmarkTotalSpending() {
        val transactions = generateTransactions(TRANSACTION_COUNT)

        repeat(WARMUP_ITERATIONS) {
            FinancialAggregator.totalSpending(transactions, START_DATE, END_DATE)
        }

        val duration = measureTime {
            repeat(BENCHMARK_ITERATIONS) {
                FinancialAggregator.totalSpending(transactions, START_DATE, END_DATE)
            }
        }

        printResult("totalSpending($TRANSACTION_COUNT txns) x$BENCHMARK_ITERATIONS", duration)
        assertTrue(
            duration.inWholeMilliseconds < 500,
            "totalSpending x$BENCHMARK_ITERATIONS should complete in <500ms, took $duration",
        )
    }

    @Test
    fun benchmarkTotalIncome() {
        val transactions = generateTransactions(TRANSACTION_COUNT)

        repeat(WARMUP_ITERATIONS) {
            FinancialAggregator.totalIncome(transactions, START_DATE, END_DATE)
        }

        val duration = measureTime {
            repeat(BENCHMARK_ITERATIONS) {
                FinancialAggregator.totalIncome(transactions, START_DATE, END_DATE)
            }
        }

        printResult("totalIncome($TRANSACTION_COUNT txns) x$BENCHMARK_ITERATIONS", duration)
        assertTrue(
            duration.inWholeMilliseconds < 500,
            "totalIncome x$BENCHMARK_ITERATIONS should complete in <500ms, took $duration",
        )
    }

    @Test
    fun benchmarkNetCashFlow() {
        val transactions = generateTransactions(TRANSACTION_COUNT)

        repeat(WARMUP_ITERATIONS) {
            FinancialAggregator.netCashFlow(transactions, START_DATE, END_DATE)
        }

        val duration = measureTime {
            repeat(BENCHMARK_ITERATIONS) {
                FinancialAggregator.netCashFlow(transactions, START_DATE, END_DATE)
            }
        }

        printResult("netCashFlow($TRANSACTION_COUNT txns) x$BENCHMARK_ITERATIONS", duration)
        assertTrue(
            duration.inWholeMilliseconds < 1000,
            "netCashFlow x$BENCHMARK_ITERATIONS should complete in <1000ms, took $duration",
        )
    }

    @Test
    fun benchmarkSpendingByCategory() {
        val transactions = generateTransactions(TRANSACTION_COUNT)

        repeat(WARMUP_ITERATIONS) {
            FinancialAggregator.spendingByCategory(transactions, START_DATE, END_DATE)
        }

        val duration = measureTime {
            repeat(BENCHMARK_ITERATIONS) {
                FinancialAggregator.spendingByCategory(transactions, START_DATE, END_DATE)
            }
        }

        printResult("spendingByCategory($TRANSACTION_COUNT txns) x$BENCHMARK_ITERATIONS", duration)
        assertTrue(
            duration.inWholeMilliseconds < 1000,
            "spendingByCategory x$BENCHMARK_ITERATIONS should complete in <1000ms, took $duration",
        )
    }

    @Test
    fun benchmarkDailySpending() {
        val transactions = generateTransactions(TRANSACTION_COUNT)
        val from = LocalDate(2024, 6, 1)
        val to = LocalDate(2024, 8, 31)

        repeat(WARMUP_ITERATIONS) {
            FinancialAggregator.dailySpending(transactions, from, to)
        }

        val duration = measureTime {
            repeat(BENCHMARK_ITERATIONS) {
                FinancialAggregator.dailySpending(transactions, from, to)
            }
        }

        printResult("dailySpending($TRANSACTION_COUNT txns, 92 days) x$BENCHMARK_ITERATIONS", duration)
        assertTrue(
            duration.inWholeMilliseconds < 500,
            "dailySpending x$BENCHMARK_ITERATIONS should complete in <500ms, took $duration",
        )
    }

    @Test
    fun benchmarkMonthlySpendingTrend() {
        val transactions = generateTransactions(TRANSACTION_COUNT)
        val referenceDate = LocalDate(2024, 12, 15)

        repeat(WARMUP_ITERATIONS) {
            FinancialAggregator.monthlySpendingTrend(transactions, 12, referenceDate)
        }

        val duration = measureTime {
            repeat(BENCHMARK_ITERATIONS) {
                FinancialAggregator.monthlySpendingTrend(transactions, 12, referenceDate)
            }
        }

        printResult("monthlySpendingTrend(12 months, $TRANSACTION_COUNT txns) x$BENCHMARK_ITERATIONS", duration)
        assertTrue(
            duration.inWholeMilliseconds < 2000,
            "monthlySpendingTrend x$BENCHMARK_ITERATIONS should complete in <2000ms, took $duration",
        )
    }

    @Test
    fun benchmarkSavingsRate() {
        val transactions = generateTransactions(TRANSACTION_COUNT)

        repeat(WARMUP_ITERATIONS) {
            FinancialAggregator.savingsRate(transactions, START_DATE, END_DATE)
        }

        val duration = measureTime {
            repeat(BENCHMARK_ITERATIONS) {
                FinancialAggregator.savingsRate(transactions, START_DATE, END_DATE)
            }
        }

        printResult("savingsRate($TRANSACTION_COUNT txns) x$BENCHMARK_ITERATIONS", duration)
        assertTrue(
            duration.inWholeMilliseconds < 1000,
            "savingsRate x$BENCHMARK_ITERATIONS should complete in <1000ms, took $duration",
        )
    }

    @Test
    fun benchmarkSpendingVelocity() {
        val transactions = generateTransactions(TRANSACTION_COUNT)
        val currentStart = LocalDate(2024, 11, 1)
        val currentEnd = LocalDate(2024, 11, 30)

        repeat(WARMUP_ITERATIONS) {
            FinancialAggregator.spendingVelocity(transactions, currentStart, currentEnd)
        }

        val duration = measureTime {
            repeat(BENCHMARK_ITERATIONS) {
                FinancialAggregator.spendingVelocity(transactions, currentStart, currentEnd)
            }
        }

        printResult("spendingVelocity($TRANSACTION_COUNT txns) x$BENCHMARK_ITERATIONS", duration)
        assertTrue(
            duration.inWholeMilliseconds < 500,
            "spendingVelocity x$BENCHMARK_ITERATIONS should complete in <500ms, took $duration",
        )
    }

    @Test
    fun benchmarkBudgetStatusCalculation() {
        TestFixtures.reset()
        val budget = TestFixtures.createBudget(
            amount = Cents(500_000),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = (1..500).map { i ->
            TestFixtures.createExpense(
                amount = Cents((i % 200 + 10).toLong() * 100),
                date = LocalDate(2024, 6, (i % 28) + 1),
            )
        }
        val referenceDate = LocalDate(2024, 6, 15)

        repeat(WARMUP_ITERATIONS) {
            BudgetCalculator.calculateStatus(budget, transactions, referenceDate)
        }

        val duration = measureTime {
            repeat(BENCHMARK_ITERATIONS) {
                BudgetCalculator.calculateStatus(budget, transactions, referenceDate)
            }
        }

        printResult("BudgetCalculator.calculateStatus(500 txns) x$BENCHMARK_ITERATIONS", duration)
        assertTrue(
            duration.inWholeMilliseconds < 200,
            "calculateStatus x$BENCHMARK_ITERATIONS should complete in <200ms, took $duration",
        )
    }

    @Test
    fun benchmarkMultipleBudgetStatuses() {
        TestFixtures.reset()
        val categories = (1..20).map { SyncId("cat-$it") }
        val budgets = categories.map { catId ->
            TestFixtures.createBudget(
                categoryId = catId,
                amount = Cents(250_000),
                period = BudgetPeriod.MONTHLY,
                startDate = LocalDate(2024, 6, 1),
            )
        }
        val transactions = (1..5_000).map { i ->
            TestFixtures.createExpense(
                amount = Cents((i % 300 + 5).toLong() * 100),
                date = LocalDate(2024, 6, (i % 28) + 1),
                categoryId = categories[i % categories.size],
            )
        }
        val referenceDate = LocalDate(2024, 6, 15)

        repeat(WARMUP_ITERATIONS) {
            budgets.forEach { BudgetCalculator.calculateStatus(it, transactions, referenceDate) }
        }

        val duration = measureTime {
            repeat(BENCHMARK_ITERATIONS) {
                budgets.forEach { budget ->
                    BudgetCalculator.calculateStatus(budget, transactions, referenceDate)
                }
            }
        }

        printResult("20 budgets x 5K txns status calc x$BENCHMARK_ITERATIONS", duration)
        assertTrue(
            duration.inWholeMilliseconds < 5000,
            "20 budget statuses x$BENCHMARK_ITERATIONS should complete in <5000ms, took $duration",
        )
    }

    @Test
    fun benchmarkDashboardWorkload() {
        val accounts = generateAccounts(ACCOUNT_COUNT)
        val transactions = generateTransactions(TRANSACTION_COUNT)
        val referenceDate = LocalDate(2024, 6, 15)
        val monthStart = LocalDate(2024, 6, 1)
        val monthEnd = LocalDate(2024, 6, 30)

        repeat(WARMUP_ITERATIONS) {
            FinancialAggregator.netWorth(accounts)
            FinancialAggregator.totalSpending(transactions, monthStart, monthEnd)
        }

        val duration = measureTime {
            FinancialAggregator.netWorth(accounts)
            FinancialAggregator.totalSpending(transactions, monthStart, monthEnd)
            FinancialAggregator.totalIncome(transactions, monthStart, monthEnd)
            FinancialAggregator.spendingByCategory(transactions, monthStart, monthEnd)
            FinancialAggregator.monthlySpendingTrend(transactions, 6, referenceDate)
            FinancialAggregator.savingsRate(transactions, monthStart, monthEnd)
        }

        printResult("Dashboard workload (6 aggregations, $TRANSACTION_COUNT txns)", duration)
        assertTrue(
            duration.inWholeMilliseconds < 200,
            "Full dashboard workload should complete in <200ms, took $duration",
        )
    }

    private fun printResult(label: String, duration: Duration) {
        println("  \u23f1  $label: $duration")
    }
}
