// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.aggregation

import com.finance.core.TestFixtures
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.datetime.*
import kotlin.test.*

/**
 * Edge case tests for [FinancialAggregator] covering empty/single-item
 * lists, date range boundaries, uncategorized transactions, and
 * transfer-type exclusion.
 */
class FinancialAggregatorEdgeCaseTest {

    private val june1 = LocalDate(2024, 6, 1)
    private val june30 = LocalDate(2024, 6, 30)

    // ═══════════════════════════════════════════════════════════════════
    // netWorth() — edge cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun netWorth_singleCheckingAccount() {
        val accounts = listOf(
            TestFixtures.createAccount(type = AccountType.CHECKING, currentBalance = Cents(50000)),
        )
        assertEquals(Cents(50000), FinancialAggregator.netWorth(accounts))
    }

    @Test
    fun netWorth_singleCreditCard() {
        val accounts = listOf(
            TestFixtures.createAccount(type = AccountType.CREDIT_CARD, currentBalance = Cents(30000)),
        )
        assertEquals(Cents(-30000), FinancialAggregator.netWorth(accounts))
    }

    @Test
    fun netWorth_singleLoan() {
        val accounts = listOf(
            TestFixtures.createAccount(type = AccountType.LOAN, currentBalance = Cents(100000)),
        )
        assertEquals(Cents(-100000), FinancialAggregator.netWorth(accounts))
    }

    @Test
    fun netWorth_allAccountsDeleted() {
        val accounts = listOf(
            TestFixtures.createAccount(
                type = AccountType.CHECKING,
                currentBalance = Cents(50000),
                deletedAt = TestFixtures.fixedInstant,
            ),
            TestFixtures.createAccount(
                type = AccountType.SAVINGS,
                currentBalance = Cents(100000),
                deletedAt = TestFixtures.fixedInstant,
            ),
        )
        assertEquals(Cents(0), FinancialAggregator.netWorth(accounts))
    }

    @Test
    fun netWorth_allAccountsArchived() {
        val accounts = listOf(
            TestFixtures.createAccount(
                type = AccountType.CHECKING,
                currentBalance = Cents(50000),
                isArchived = true,
            ),
        )
        assertEquals(Cents(0), FinancialAggregator.netWorth(accounts))
    }

    @Test
    fun netWorth_zeroBalanceAccounts() {
        val accounts = listOf(
            TestFixtures.createAccount(type = AccountType.CHECKING, currentBalance = Cents(0)),
            TestFixtures.createAccount(type = AccountType.CREDIT_CARD, currentBalance = Cents(0)),
        )
        assertEquals(Cents(0), FinancialAggregator.netWorth(accounts))
    }

    @Test
    fun netWorth_investmentAccountCountsPositive() {
        val accounts = listOf(
            TestFixtures.createAccount(type = AccountType.INVESTMENT, currentBalance = Cents(1000000)),
        )
        assertEquals(Cents(1000000), FinancialAggregator.netWorth(accounts))
    }

    // ═══════════════════════════════════════════════════════════════════
    // totalSpending() — single transaction
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun totalSpending_singleTransaction() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(4999), date = LocalDate(2024, 6, 15)),
        )
        assertEquals(Cents(4999), FinancialAggregator.totalSpending(transactions, june1, june30))
    }

    @Test
    fun totalSpending_transfersExcluded() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 6, 5)),
            TestFixtures.createTransaction(
                type = TransactionType.TRANSFER,
                amount = Cents(5000),
                date = LocalDate(2024, 6, 10),
                accountId = SyncId("account-1"),
                transferAccountId = SyncId("account-2"),
            ),
        )
        // Transfer is not an EXPENSE, so excluded
        assertEquals(Cents(1000), FinancialAggregator.totalSpending(transactions, june1, june30))
    }

    @Test
    fun totalSpending_pendingTransactionsIncluded() {
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(1000),
                date = LocalDate(2024, 6, 5),
                status = TransactionStatus.PENDING,
            ),
        )
        // PENDING is not VOID, so it IS included
        assertEquals(Cents(1000), FinancialAggregator.totalSpending(transactions, june1, june30))
    }

    @Test
    fun totalSpending_reconciledTransactionsIncluded() {
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(2000),
                date = LocalDate(2024, 6, 5),
                status = TransactionStatus.RECONCILED,
            ),
        )
        assertEquals(Cents(2000), FinancialAggregator.totalSpending(transactions, june1, june30))
    }

    // ═══════════════════════════════════════════════════════════════════
    // totalSpending() — date range with no matching transactions
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun totalSpending_allTransactionsOutsideRange() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 5, 15)),
            TestFixtures.createExpense(amount = Cents(2000), date = LocalDate(2024, 7, 15)),
        )
        assertEquals(Cents(0), FinancialAggregator.totalSpending(transactions, june1, june30))
    }

    @Test
    fun totalSpending_singleDayRange() {
        val date = LocalDate(2024, 6, 15)
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(500), date = date),
            TestFixtures.createExpense(amount = Cents(300), date = date),
            TestFixtures.createExpense(amount = Cents(700), date = LocalDate(2024, 6, 14)),
        )
        // Only the two on June 15
        assertEquals(Cents(800), FinancialAggregator.totalSpending(transactions, date, date))
    }

    // ═══════════════════════════════════════════════════════════════════
    // totalIncome() — single transaction
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun totalIncome_singleTransaction() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(250000), date = LocalDate(2024, 6, 1)),
        )
        assertEquals(Cents(250000), FinancialAggregator.totalIncome(transactions, june1, june30))
    }

    @Test
    fun totalIncome_emptyList() {
        assertEquals(Cents(0), FinancialAggregator.totalIncome(emptyList(), june1, june30))
    }

    @Test
    fun totalIncome_transfersExcluded() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(100000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createTransaction(
                type = TransactionType.TRANSFER,
                amount = Cents(50000),
                date = LocalDate(2024, 6, 5),
                accountId = SyncId("account-1"),
                transferAccountId = SyncId("account-2"),
            ),
        )
        assertEquals(Cents(100000), FinancialAggregator.totalIncome(transactions, june1, june30))
    }

    // ═══════════════════════════════════════════════════════════════════
    // netCashFlow() — single transaction
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun netCashFlow_singleExpense() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(5000), date = LocalDate(2024, 6, 15)),
        )
        assertEquals(Cents(-5000), FinancialAggregator.netCashFlow(transactions, june1, june30))
    }

    @Test
    fun netCashFlow_singleIncome() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(100000), date = LocalDate(2024, 6, 1)),
        )
        assertEquals(Cents(100000), FinancialAggregator.netCashFlow(transactions, june1, june30))
    }

    // ═══════════════════════════════════════════════════════════════════
    // spendingByCategory() — edge cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun spendingByCategory_mixedCategorizedAndUncategorized() {
        val groceryId = SyncId("groceries")
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(5000),
                categoryId = groceryId,
                date = LocalDate(2024, 6, 5),
            ),
            TestFixtures.createExpense(
                amount = Cents(3000),
                categoryId = null,
                date = LocalDate(2024, 6, 10),
            ),
            TestFixtures.createExpense(
                amount = Cents(2000),
                categoryId = null,
                date = LocalDate(2024, 6, 15),
            ),
        )
        val result = FinancialAggregator.spendingByCategory(transactions, june1, june30)

        assertEquals(2, result.size)
        assertEquals(Cents(5000), result[groceryId])
        assertEquals(Cents(5000), result[null])  // Uncategorized are grouped under null key
    }

    @Test
    fun spendingByCategory_singleTransaction() {
        val catId = SyncId("groceries")
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1000), categoryId = catId, date = LocalDate(2024, 6, 5)),
        )
        val result = FinancialAggregator.spendingByCategory(transactions, june1, june30)

        assertEquals(1, result.size)
        assertEquals(Cents(1000), result[catId])
    }

    @Test
    fun spendingByCategory_manyCategories() {
        val categories = (1..10).map { SyncId("cat-$it") }
        val transactions = categories.map { catId ->
            TestFixtures.createExpense(
                amount = Cents(100),
                categoryId = catId,
                date = LocalDate(2024, 6, 15),
            )
        }
        val result = FinancialAggregator.spendingByCategory(transactions, june1, june30)

        assertEquals(10, result.size)
        categories.forEach { catId ->
            assertEquals(Cents(100), result[catId])
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // dailySpending() — edge cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun dailySpending_singleDayRange() {
        val date = LocalDate(2024, 6, 15)
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1000), date = date),
            TestFixtures.createExpense(amount = Cents(500), date = date),
        )
        val result = FinancialAggregator.dailySpending(transactions, date, date)

        assertEquals(1, result.size)
        assertEquals(Cents(1500), result[date])
    }

    @Test
    fun dailySpending_noExpensesOnSomeDays() {
        // Only 2 days have transactions in a 30-day range
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createExpense(amount = Cents(2000), date = LocalDate(2024, 6, 30)),
        )
        val result = FinancialAggregator.dailySpending(transactions, june1, june30)

        // Only days with expenses appear in the map
        assertEquals(2, result.size)
        assertEquals(Cents(1000), result[LocalDate(2024, 6, 1)])
        assertEquals(Cents(2000), result[LocalDate(2024, 6, 30)])
    }

    // ═══════════════════════════════════════════════════════════════════
    // monthlySpendingTrend() — edge cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun monthlySpendingTrend_zeroMonths() {
        val result = FinancialAggregator.monthlySpendingTrend(
            emptyList(), months = 0, referenceDate = LocalDate(2024, 6, 15),
        )
        assertTrue(result.isEmpty())
    }

    @Test
    fun monthlySpendingTrend_noTransactionsAtAll() {
        val result = FinancialAggregator.monthlySpendingTrend(
            emptyList(), months = 3, referenceDate = LocalDate(2024, 6, 15),
        )
        assertEquals(3, result.size)
        assertTrue(result.all { it.total.isZero() })
    }

    @Test
    fun monthlySpendingTrend_twelvemonths() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 1, 15)),
            TestFixtures.createExpense(amount = Cents(2000), date = LocalDate(2024, 6, 15)),
        )
        val result = FinancialAggregator.monthlySpendingTrend(
            transactions, months = 12, referenceDate = LocalDate(2024, 6, 15),
        )
        assertEquals(12, result.size)
        // July 2023 through June 2024
        assertEquals(Month.JULY, result[0].month)
        assertEquals(2023, result[0].year)
        assertEquals(Month.JUNE, result[11].month)
        assertEquals(2024, result[11].year)
    }

    // ═══════════════════════════════════════════════════════════════════
    // savingsRate() — edge cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun savingsRate_fiftyPercent() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(100000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createExpense(amount = Cents(50000), date = LocalDate(2024, 6, 10)),
        )
        assertEquals(50.0, FinancialAggregator.savingsRate(transactions, june1, june30), 1e-10)
    }

    @Test
    fun savingsRate_entireIncomeSpent() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(100000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createExpense(amount = Cents(100000), date = LocalDate(2024, 6, 10)),
        )
        assertEquals(0.0, FinancialAggregator.savingsRate(transactions, june1, june30), 1e-10)
    }

    @Test
    fun savingsRate_veryHighSavings() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(100000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createExpense(amount = Cents(1), date = LocalDate(2024, 6, 10)),
        )
        val rate = FinancialAggregator.savingsRate(transactions, june1, june30)
        assertTrue(rate > 99.0 && rate < 100.0)
    }

    // ═══════════════════════════════════════════════════════════════════
    // averageDailySpending() — edge cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun averageDailySpending_invertedDateRange_returnsZero() {
        // from > to → days = negative → should return zero
        val result = FinancialAggregator.averageDailySpending(
            emptyList(),
            LocalDate(2024, 6, 30),
            LocalDate(2024, 6, 1),
        )
        assertEquals(Cents(0), result)
    }

    @Test
    fun averageDailySpending_multipleTransactionsSingleDay() {
        val date = LocalDate(2024, 6, 15)
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1000), date = date),
            TestFixtures.createExpense(amount = Cents(2000), date = date),
            TestFixtures.createExpense(amount = Cents(3000), date = date),
        )
        // Single day, total 6000
        assertEquals(Cents(6000), FinancialAggregator.averageDailySpending(transactions, date, date))
    }

    @Test
    fun averageDailySpending_unevenDivision() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 6, 15)),
        )
        // June has 30 days. 10000 / 30 = 333.33... → banker's round → 333
        val result = FinancialAggregator.averageDailySpending(transactions, june1, june30)
        assertEquals(Cents(333), result)
    }

    // ═══════════════════════════════════════════════════════════════════
    // spendingVelocity() — edge cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun spendingVelocity_zeroCurrentSpending_positivePrevious() {
        val transactions = listOf(
            // Only last month spending, no current month
            TestFixtures.createExpense(amount = Cents(50000), date = LocalDate(2024, 5, 5)),
        )
        val velocity = FinancialAggregator.spendingVelocity(transactions, june1, june30)
        assertEquals(0.0, velocity, 1e-10)
    }

    @Test
    fun spendingVelocity_doubleSpending() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 5, 5)),
            TestFixtures.createExpense(amount = Cents(20000), date = LocalDate(2024, 6, 5)),
        )
        val velocity = FinancialAggregator.spendingVelocity(transactions, june1, june30)
        assertEquals(2.0, velocity, 1e-10)
    }

    @Test
    fun spendingVelocity_quarterSpending() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(40000), date = LocalDate(2024, 5, 5)),
            TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 6, 5)),
        )
        val velocity = FinancialAggregator.spendingVelocity(transactions, june1, june30)
        assertEquals(0.25, velocity, 1e-10)
    }
}
