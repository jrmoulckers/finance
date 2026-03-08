// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.aggregation

import com.finance.core.TestFixtures
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.datetime.*
import kotlin.test.*

class FinancialAggregatorTest {

    // ═══════════════════════════════════════════════════════════════════
    // netWorth()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun netWorth_checkingAndSavings_positive() {
        val accounts = listOf(
            TestFixtures.createAccount(type = AccountType.CHECKING, currentBalance = Cents(100000)),
            TestFixtures.createAccount(type = AccountType.SAVINGS, currentBalance = Cents(200000)),
        )
        assertEquals(Cents(300000), FinancialAggregator.netWorth(accounts))
    }

    @Test
    fun netWorth_creditCard_subtracted() {
        val accounts = listOf(
            TestFixtures.createAccount(type = AccountType.CHECKING, currentBalance = Cents(500000)),
            TestFixtures.createAccount(type = AccountType.CREDIT_CARD, currentBalance = Cents(50000)),
        )
        // 500000 - 50000 = 450000
        assertEquals(Cents(450000), FinancialAggregator.netWorth(accounts))
    }

    @Test
    fun netWorth_loan_subtracted() {
        val accounts = listOf(
            TestFixtures.createAccount(type = AccountType.CHECKING, currentBalance = Cents(500000)),
            TestFixtures.createAccount(type = AccountType.LOAN, currentBalance = Cents(300000)),
        )
        assertEquals(Cents(200000), FinancialAggregator.netWorth(accounts))
    }

    @Test
    fun netWorth_mixedAccountTypes() {
        val accounts = listOf(
            TestFixtures.createAccount(type = AccountType.CHECKING, currentBalance = Cents(100000)),
            TestFixtures.createAccount(type = AccountType.SAVINGS, currentBalance = Cents(200000)),
            TestFixtures.createAccount(type = AccountType.INVESTMENT, currentBalance = Cents(500000)),
            TestFixtures.createAccount(type = AccountType.CREDIT_CARD, currentBalance = Cents(50000)),
            TestFixtures.createAccount(type = AccountType.LOAN, currentBalance = Cents(150000)),
        )
        // 100000 + 200000 + 500000 - 50000 - 150000 = 600000
        assertEquals(Cents(600000), FinancialAggregator.netWorth(accounts))
    }

    @Test
    fun netWorth_excludesDeletedAccounts() {
        val accounts = listOf(
            TestFixtures.createAccount(
                type = AccountType.CHECKING,
                currentBalance = Cents(100000),
            ),
            TestFixtures.createAccount(
                type = AccountType.SAVINGS,
                currentBalance = Cents(999999),
                deletedAt = TestFixtures.fixedInstant,
            ),
        )
        assertEquals(Cents(100000), FinancialAggregator.netWorth(accounts))
    }

    @Test
    fun netWorth_excludesArchivedAccounts() {
        val accounts = listOf(
            TestFixtures.createAccount(
                type = AccountType.CHECKING,
                currentBalance = Cents(100000),
            ),
            TestFixtures.createAccount(
                type = AccountType.SAVINGS,
                currentBalance = Cents(500000),
                isArchived = true,
            ),
        )
        assertEquals(Cents(100000), FinancialAggregator.netWorth(accounts))
    }

    @Test
    fun netWorth_emptyAccounts() {
        assertEquals(Cents(0), FinancialAggregator.netWorth(emptyList()))
    }

    @Test
    fun netWorth_negative_moreDebtThanAssets() {
        val accounts = listOf(
            TestFixtures.createAccount(type = AccountType.CHECKING, currentBalance = Cents(10000)),
            TestFixtures.createAccount(type = AccountType.CREDIT_CARD, currentBalance = Cents(50000)),
        )
        assertEquals(Cents(-40000), FinancialAggregator.netWorth(accounts))
    }

    @Test
    fun netWorth_cashAndOther_positive() {
        val accounts = listOf(
            TestFixtures.createAccount(type = AccountType.CASH, currentBalance = Cents(5000)),
            TestFixtures.createAccount(type = AccountType.OTHER, currentBalance = Cents(3000)),
        )
        assertEquals(Cents(8000), FinancialAggregator.netWorth(accounts))
    }

    // ═══════════════════════════════════════════════════════════════════
    // totalSpending()
    // ═══════════════════════════════════════════════════════════════════

    private val june1 = LocalDate(2024, 6, 1)
    private val june30 = LocalDate(2024, 6, 30)

    @Test
    fun totalSpending_sumOfExpenses() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 6, 5)),
            TestFixtures.createExpense(amount = Cents(2000), date = LocalDate(2024, 6, 10)),
            TestFixtures.createExpense(amount = Cents(3000), date = LocalDate(2024, 6, 20)),
        )
        assertEquals(Cents(6000), FinancialAggregator.totalSpending(transactions, june1, june30))
    }

    @Test
    fun totalSpending_filtersByDateRange() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 5, 31)), // before
            TestFixtures.createExpense(amount = Cents(2000), date = LocalDate(2024, 6, 1)),  // start boundary
            TestFixtures.createExpense(amount = Cents(3000), date = LocalDate(2024, 6, 15)), // inside
            TestFixtures.createExpense(amount = Cents(4000), date = LocalDate(2024, 6, 30)), // end boundary
            TestFixtures.createExpense(amount = Cents(5000), date = LocalDate(2024, 7, 1)),  // after
        )
        // Only 2000 + 3000 + 4000 = 9000
        assertEquals(Cents(9000), FinancialAggregator.totalSpending(transactions, june1, june30))
    }

    @Test
    fun totalSpending_excludesIncome() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 6, 5)),
            TestFixtures.createIncome(amount = Cents(5000), date = LocalDate(2024, 6, 5)),
        )
        assertEquals(Cents(1000), FinancialAggregator.totalSpending(transactions, june1, june30))
    }

    @Test
    fun totalSpending_excludesVoidTransactions() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 6, 5)),
            TestFixtures.createExpense(
                amount = Cents(9999),
                date = LocalDate(2024, 6, 10),
                status = TransactionStatus.VOID,
            ),
        )
        assertEquals(Cents(1000), FinancialAggregator.totalSpending(transactions, june1, june30))
    }

    @Test
    fun totalSpending_excludesDeletedTransactions() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 6, 5)),
            TestFixtures.createExpense(
                amount = Cents(5000),
                date = LocalDate(2024, 6, 10),
                deletedAt = TestFixtures.fixedInstant,
            ),
        )
        assertEquals(Cents(1000), FinancialAggregator.totalSpending(transactions, june1, june30))
    }

    @Test
    fun totalSpending_emptyTransactions() {
        assertEquals(Cents(0), FinancialAggregator.totalSpending(emptyList(), june1, june30))
    }

    @Test
    fun totalSpending_usesAbsoluteValue() {
        // Negative expense amounts should still contribute positively to spending
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(-1000), date = LocalDate(2024, 6, 5)),
        )
        assertEquals(Cents(1000), FinancialAggregator.totalSpending(transactions, june1, june30))
    }

    // ═══════════════════════════════════════════════════════════════════
    // totalIncome()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun totalIncome_sumOfIncome() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(100000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createIncome(amount = Cents(50000), date = LocalDate(2024, 6, 15)),
        )
        assertEquals(Cents(150000), FinancialAggregator.totalIncome(transactions, june1, june30))
    }

    @Test
    fun totalIncome_excludesExpenses() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(100000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createExpense(amount = Cents(5000), date = LocalDate(2024, 6, 5)),
        )
        assertEquals(Cents(100000), FinancialAggregator.totalIncome(transactions, june1, june30))
    }

    @Test
    fun totalIncome_excludesVoid() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(100000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createIncome(
                amount = Cents(50000),
                date = LocalDate(2024, 6, 15),
                status = TransactionStatus.VOID,
            ),
        )
        assertEquals(Cents(100000), FinancialAggregator.totalIncome(transactions, june1, june30))
    }

    @Test
    fun totalIncome_filtersByDateRange() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(50000), date = LocalDate(2024, 5, 31)),
            TestFixtures.createIncome(amount = Cents(100000), date = LocalDate(2024, 6, 15)),
            TestFixtures.createIncome(amount = Cents(75000), date = LocalDate(2024, 7, 1)),
        )
        assertEquals(Cents(100000), FinancialAggregator.totalIncome(transactions, june1, june30))
    }

    // ═══════════════════════════════════════════════════════════════════
    // netCashFlow()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun netCashFlow_incomeMinusExpenses() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(100000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createExpense(amount = Cents(30000), date = LocalDate(2024, 6, 10)),
            TestFixtures.createExpense(amount = Cents(20000), date = LocalDate(2024, 6, 20)),
        )
        // 100000 - (30000 + 20000) = 50000
        assertEquals(Cents(50000), FinancialAggregator.netCashFlow(transactions, june1, june30))
    }

    @Test
    fun netCashFlow_negative_moreExpensesThanIncome() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(30000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createExpense(amount = Cents(50000), date = LocalDate(2024, 6, 10)),
        )
        assertEquals(Cents(-20000), FinancialAggregator.netCashFlow(transactions, june1, june30))
    }

    @Test
    fun netCashFlow_zero_balanced() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(50000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createExpense(amount = Cents(50000), date = LocalDate(2024, 6, 10)),
        )
        assertEquals(Cents(0), FinancialAggregator.netCashFlow(transactions, june1, june30))
    }

    @Test
    fun netCashFlow_noTransactions() {
        assertEquals(Cents(0), FinancialAggregator.netCashFlow(emptyList(), june1, june30))
    }

    // ═══════════════════════════════════════════════════════════════════
    // spendingByCategory()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun spendingByCategory_groupsCorrectly() {
        val cat1 = SyncId("groceries")
        val cat2 = SyncId("dining")
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(5000), categoryId = cat1, date = LocalDate(2024, 6, 5)),
            TestFixtures.createExpense(amount = Cents(3000), categoryId = cat1, date = LocalDate(2024, 6, 10)),
            TestFixtures.createExpense(amount = Cents(2000), categoryId = cat2, date = LocalDate(2024, 6, 15)),
        )
        val result = FinancialAggregator.spendingByCategory(transactions, june1, june30)

        assertEquals(2, result.size)
        assertEquals(Cents(8000), result[cat1])
        assertEquals(Cents(2000), result[cat2])
    }

    @Test
    fun spendingByCategory_uncategorized() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1000), categoryId = null, date = LocalDate(2024, 6, 5)),
        )
        val result = FinancialAggregator.spendingByCategory(transactions, june1, june30)

        assertEquals(1, result.size)
        assertEquals(Cents(1000), result[null])
    }

    @Test
    fun spendingByCategory_emptyTransactions() {
        val result = FinancialAggregator.spendingByCategory(emptyList(), june1, june30)
        assertTrue(result.isEmpty())
    }

    @Test
    fun spendingByCategory_excludesVoidAndDeleted() {
        val cat = SyncId("groceries")
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(5000), categoryId = cat, date = LocalDate(2024, 6, 5)),
            TestFixtures.createExpense(
                amount = Cents(3000), categoryId = cat, date = LocalDate(2024, 6, 10),
                status = TransactionStatus.VOID,
            ),
            TestFixtures.createExpense(
                amount = Cents(2000), categoryId = cat, date = LocalDate(2024, 6, 15),
                deletedAt = TestFixtures.fixedInstant,
            ),
        )
        val result = FinancialAggregator.spendingByCategory(transactions, june1, june30)
        assertEquals(Cents(5000), result[cat])
    }

    // ═══════════════════════════════════════════════════════════════════
    // dailySpending()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun dailySpending_groupsByDate() {
        val date1 = LocalDate(2024, 6, 5)
        val date2 = LocalDate(2024, 6, 10)
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1000), date = date1),
            TestFixtures.createExpense(amount = Cents(2000), date = date1),
            TestFixtures.createExpense(amount = Cents(3000), date = date2),
        )
        val result = FinancialAggregator.dailySpending(transactions, june1, june30)

        assertEquals(2, result.size)
        assertEquals(Cents(3000), result[date1])
        assertEquals(Cents(3000), result[date2])
    }

    @Test
    fun dailySpending_excludesIncomeAndVoid() {
        val date = LocalDate(2024, 6, 5)
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1000), date = date),
            TestFixtures.createIncome(amount = Cents(5000), date = date),
            TestFixtures.createExpense(amount = Cents(2000), date = date, status = TransactionStatus.VOID),
        )
        val result = FinancialAggregator.dailySpending(transactions, june1, june30)
        assertEquals(Cents(1000), result[date])
    }

    @Test
    fun dailySpending_emptyTransactions() {
        val result = FinancialAggregator.dailySpending(emptyList(), june1, june30)
        assertTrue(result.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // monthlySpendingTrend()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun monthlySpendingTrend_correctMonthBoundaries() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 4, 15)),
            TestFixtures.createExpense(amount = Cents(20000), date = LocalDate(2024, 5, 10)),
            TestFixtures.createExpense(amount = Cents(30000), date = LocalDate(2024, 6, 5)),
        )
        val result = FinancialAggregator.monthlySpendingTrend(
            transactions, months = 3, referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(3, result.size)
        // Reversed: oldest first
        assertEquals(Month.APRIL, result[0].month)
        assertEquals(2024, result[0].year)
        assertEquals(Cents(10000), result[0].total)

        assertEquals(Month.MAY, result[1].month)
        assertEquals(Cents(20000), result[1].total)

        assertEquals(Month.JUNE, result[2].month)
        assertEquals(Cents(30000), result[2].total)
    }

    @Test
    fun monthlySpendingTrend_monthWithNoTransactions() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 6, 5)),
        )
        val result = FinancialAggregator.monthlySpendingTrend(
            transactions, months = 3, referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(3, result.size)
        assertEquals(Cents(0), result[0].total) // April — no transactions
        assertEquals(Cents(0), result[1].total) // May — no transactions
        assertEquals(Cents(10000), result[2].total) // June
    }

    @Test
    fun monthlySpendingTrend_singleMonth() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(5000), date = LocalDate(2024, 6, 15)),
        )
        val result = FinancialAggregator.monthlySpendingTrend(
            transactions, months = 1, referenceDate = LocalDate(2024, 6, 15),
        )
        assertEquals(1, result.size)
        assertEquals(Month.JUNE, result[0].month)
        assertEquals(Cents(5000), result[0].total)
    }

    @Test
    fun monthlySpendingTrend_crossYearBoundary() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2023, 12, 15)),
            TestFixtures.createExpense(amount = Cents(2000), date = LocalDate(2024, 1, 10)),
        )
        val result = FinancialAggregator.monthlySpendingTrend(
            transactions, months = 2, referenceDate = LocalDate(2024, 1, 15),
        )

        assertEquals(2, result.size)
        assertEquals(Month.DECEMBER, result[0].month)
        assertEquals(2023, result[0].year)
        assertEquals(Cents(1000), result[0].total)
        assertEquals(Month.JANUARY, result[1].month)
        assertEquals(2024, result[1].year)
        assertEquals(Cents(2000), result[1].total)
    }

    // ═══════════════════════════════════════════════════════════════════
    // savingsRate()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun savingsRate_normalCase() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(100000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createExpense(amount = Cents(70000), date = LocalDate(2024, 6, 10)),
        )
        // (100000 - 70000) / 100000 * 100 = 30.0%
        assertEquals(30.0, FinancialAggregator.savingsRate(transactions, june1, june30), 1e-10)
    }

    @Test
    fun savingsRate_zeroIncome_returnsZero() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(5000), date = LocalDate(2024, 6, 10)),
        )
        assertEquals(0.0, FinancialAggregator.savingsRate(transactions, june1, june30))
    }

    @Test
    fun savingsRate_noExpenses_hundredPercent() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(100000), date = LocalDate(2024, 6, 1)),
        )
        assertEquals(100.0, FinancialAggregator.savingsRate(transactions, june1, june30), 1e-10)
    }

    @Test
    fun savingsRate_negative_overspending() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(50000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createExpense(amount = Cents(80000), date = LocalDate(2024, 6, 10)),
        )
        // (50000 - 80000) / 50000 * 100 = -60.0%
        assertEquals(-60.0, FinancialAggregator.savingsRate(transactions, june1, june30), 1e-10)
    }

    @Test
    fun savingsRate_noTransactions() {
        assertEquals(0.0, FinancialAggregator.savingsRate(emptyList(), june1, june30))
    }

    // ═══════════════════════════════════════════════════════════════════
    // averageDailySpending()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun averageDailySpending_normalCase() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(30000), date = LocalDate(2024, 6, 15)),
        )
        // June 1-30 = 30 days. 30000 / 30 = 1000
        assertEquals(Cents(1000), FinancialAggregator.averageDailySpending(transactions, june1, june30))
    }

    @Test
    fun averageDailySpending_singleDay() {
        val date = LocalDate(2024, 6, 15)
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(5000), date = date),
        )
        // from==to: 1 day
        assertEquals(Cents(5000), FinancialAggregator.averageDailySpending(transactions, date, date))
    }

    @Test
    fun averageDailySpending_noTransactions() {
        assertEquals(Cents(0), FinancialAggregator.averageDailySpending(emptyList(), june1, june30))
    }

    // ═══════════════════════════════════════════════════════════════════
    // spendingVelocity()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun spendingVelocity_sameAsLastMonth() {
        val transactions = listOf(
            // Last month: May 1-31
            TestFixtures.createExpense(amount = Cents(50000), date = LocalDate(2024, 5, 5)),
            // This month: June 1-30
            TestFixtures.createExpense(amount = Cents(50000), date = LocalDate(2024, 6, 5)),
        )
        val velocity = FinancialAggregator.spendingVelocity(transactions, june1, june30)
        assertEquals(1.0, velocity, 1e-10) // Same spending
    }

    @Test
    fun spendingVelocity_fiftyPercentMore() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(20000), date = LocalDate(2024, 5, 5)),
            TestFixtures.createExpense(amount = Cents(30000), date = LocalDate(2024, 6, 5)),
        )
        val velocity = FinancialAggregator.spendingVelocity(transactions, june1, june30)
        assertEquals(1.5, velocity, 1e-10)
    }

    @Test
    fun spendingVelocity_fiftyPercentLess() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(40000), date = LocalDate(2024, 5, 5)),
            TestFixtures.createExpense(amount = Cents(20000), date = LocalDate(2024, 6, 5)),
        )
        val velocity = FinancialAggregator.spendingVelocity(transactions, june1, june30)
        assertEquals(0.5, velocity, 1e-10)
    }

    @Test
    fun spendingVelocity_zeroPreviousMonth_withCurrentSpending() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(30000), date = LocalDate(2024, 6, 5)),
        )
        val velocity = FinancialAggregator.spendingVelocity(transactions, june1, june30)
        assertEquals(Double.MAX_VALUE, velocity)
    }

    @Test
    fun spendingVelocity_zeroBothMonths() {
        val velocity = FinancialAggregator.spendingVelocity(emptyList(), june1, june30)
        assertEquals(1.0, velocity, 1e-10)
    }
}
