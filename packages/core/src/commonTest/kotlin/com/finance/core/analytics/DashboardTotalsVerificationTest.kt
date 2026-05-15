// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.analytics

import com.finance.core.TestFixtures
import com.finance.core.aggregation.FinancialAggregator
import com.finance.core.budget.BudgetCalculator
import com.finance.core.budget.BudgetHealth
import com.finance.models.AccountType
import com.finance.models.TransactionStatus
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate
import kotlin.test.*

/**
 * Sprint 2 verification tests for #1367 — Dashboard Financial Totals Reconciliation.
 *
 * Covers:
 * - Net worth = sum of all account balances
 * - Monthly income/expense totals match transaction sums
 * - Budget utilization percentage calculation
 * - Handling of pending vs cleared transactions in totals
 */
class DashboardTotalsVerificationTest {

    @BeforeTest
    fun setUp() {
        TestFixtures.reset()
    }

    // ═══════════════════════════════════════════════════════════════════
    // Net worth = sum of all account balances
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun netWorth_equalsAccountBalanceSum() {
        val accounts = listOf(
            TestFixtures.createAccount(name = "Checking", type = AccountType.CHECKING, currentBalance = Cents(250000)),
            TestFixtures.createAccount(name = "Savings", type = AccountType.SAVINGS, currentBalance = Cents(1000000)),
            TestFixtures.createAccount(name = "Investment", type = AccountType.INVESTMENT, currentBalance = Cents(500000)),
        )

        val netWorth = FinancialAggregator.netWorth(accounts)
        val expectedSum = 250000L + 1000000L + 500000L
        assertEquals(Cents(expectedSum), netWorth, "Net worth = sum of asset accounts")
    }

    @Test
    fun netWorth_liabilitiesSubtracted() {
        val accounts = listOf(
            TestFixtures.createAccount(name = "Checking", type = AccountType.CHECKING, currentBalance = Cents(500000)),
            TestFixtures.createAccount(name = "Credit Card", type = AccountType.CREDIT_CARD, currentBalance = Cents(200000)),
            TestFixtures.createAccount(name = "Auto Loan", type = AccountType.LOAN, currentBalance = Cents(1500000)),
        )

        val netWorth = FinancialAggregator.netWorth(accounts)
        assertEquals(Cents(500000L - 200000L - 1500000L), netWorth)
        assertTrue(netWorth.isNegative(), "Net worth can be negative when liabilities exceed assets")
    }

    @Test
    fun netWorth_emptyAccounts_isZero() {
        val netWorth = FinancialAggregator.netWorth(emptyList())
        assertEquals(Cents.ZERO, netWorth)
    }

    @Test
    fun netWorth_excludesArchivedAndDeleted() {
        val accounts = listOf(
            TestFixtures.createAccount(name = "Active", currentBalance = Cents(100000)),
            TestFixtures.createAccount(name = "Archived", currentBalance = Cents(999999), isArchived = true),
            TestFixtures.createAccount(
                name = "Deleted",
                currentBalance = Cents(888888),
                deletedAt = TestFixtures.fixedInstant,
            ),
        )

        val netWorth = FinancialAggregator.netWorth(accounts)
        assertEquals(Cents(100000), netWorth, "Only active, non-deleted accounts counted")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Monthly income/expense totals match transaction sums
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun monthlyTotals_incomeMatchesTransactionSum() {
        val incomes = listOf(
            TestFixtures.createIncome(amount = Cents(300000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createIncome(amount = Cents(200000), date = LocalDate(2024, 6, 15)),
            TestFixtures.createIncome(amount = Cents(50000), date = LocalDate(2024, 6, 28)),
        )

        val total = FinancialAggregator.totalIncome(
            incomes,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 30),
        )
        val manualSum = Cents(300000L + 200000L + 50000L)
        assertEquals(manualSum, total, "Total income = sum of all income transactions")
    }

    @Test
    fun monthlyTotals_expenseMatchesTransactionSum() {
        val expenses = listOf(
            TestFixtures.createExpense(amount = Cents(5000), date = LocalDate(2024, 6, 3)),
            TestFixtures.createExpense(amount = Cents(12500), date = LocalDate(2024, 6, 10)),
            TestFixtures.createExpense(amount = Cents(7500), date = LocalDate(2024, 6, 20)),
        )

        val total = FinancialAggregator.totalSpending(
            expenses,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 30),
        )
        val manualSum = Cents(5000L + 12500L + 7500L)
        assertEquals(manualSum, total, "Total expense = sum of all expense transactions")
    }

    @Test
    fun monthlyTotals_netCashFlow_equalsIncomeMinusExpense() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(500000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createExpense(amount = Cents(200000), date = LocalDate(2024, 6, 5)),
            TestFixtures.createExpense(amount = Cents(100000), date = LocalDate(2024, 6, 15)),
        )

        val net = FinancialAggregator.netCashFlow(
            transactions,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 30),
        )
        assertEquals(Cents(200000), net, "Net = $5000 - $2000 - $1000 = $2000")
    }

    @Test
    fun monthlyTotals_transfersExcluded_fromIncomeAndExpense() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(500000), date = LocalDate(2024, 6, 1)),
            TestFixtures.createExpense(amount = Cents(100000), date = LocalDate(2024, 6, 5)),
            TestFixtures.createTransaction(
                type = TransactionType.TRANSFER,
                amount = Cents(50000),
                date = LocalDate(2024, 6, 10),
                transferAccountId = SyncId("acct-2"),
            ),
        )

        val income = FinancialAggregator.totalIncome(
            transactions,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 30),
        )
        val expense = FinancialAggregator.totalSpending(
            transactions,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 30),
        )

        assertEquals(Cents(500000), income, "Transfers don't count as income")
        assertEquals(Cents(100000), expense, "Transfers don't count as expenses")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Budget utilization percentage calculation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun budgetUtilization_percentageCalculatedCorrectly() {
        val budget = TestFixtures.createBudget(
            categoryId = SyncId("cat-dining"),
            amount = Cents(40000), // $400
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(10000), categoryId = SyncId("cat-dining"), date = LocalDate(2024, 6, 5)),
            TestFixtures.createExpense(amount = Cents(20000), categoryId = SyncId("cat-dining"), date = LocalDate(2024, 6, 15)),
        )

        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))
        assertEquals(Cents(30000), status.spent)
        assertEquals(0.75, status.utilization, 0.001, "75% utilization")
        assertFalse(status.isOverBudget)
    }

    @Test
    fun budgetUtilization_overBudget_flagged() {
        val budget = TestFixtures.createBudget(
            categoryId = SyncId("cat-groceries"),
            amount = Cents(20000), // $200
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(15000), categoryId = SyncId("cat-groceries"), date = LocalDate(2024, 6, 5)),
            TestFixtures.createExpense(amount = Cents(10000), categoryId = SyncId("cat-groceries"), date = LocalDate(2024, 6, 15)),
        )

        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))
        assertTrue(status.isOverBudget, "Spent $250 on $200 budget")
        assertTrue(status.utilization > 1.0)
        assertEquals(BudgetHealth.OVER, status.healthLevel)
    }

    @Test
    fun budgetUtilization_warningZone_75to100percent() {
        val budget = TestFixtures.createBudget(
            categoryId = SyncId("cat-gas"),
            amount = Cents(10000), // $100
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(8000), categoryId = SyncId("cat-gas"), date = LocalDate(2024, 6, 10)),
        )

        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))
        assertEquals(BudgetHealth.WARNING, status.healthLevel, "80% utilization = WARNING")
    }

    @Test
    fun budgetUtilization_healthyZone_under75percent() {
        val budget = TestFixtures.createBudget(
            categoryId = SyncId("cat-fun"),
            amount = Cents(10000),
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(5000), categoryId = SyncId("cat-fun"), date = LocalDate(2024, 6, 10)),
        )

        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))
        assertEquals(BudgetHealth.HEALTHY, status.healthLevel, "50% utilization = HEALTHY")
    }

    @Test
    fun budgetUtilization_zeroBudgetAmount_zeroUtilization() {
        // Budget amount must be positive per model validation, so test with smallest positive
        val budget = TestFixtures.createBudget(
            categoryId = SyncId("cat-misc"),
            amount = Cents(1), // 1 cent
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1), categoryId = SyncId("cat-misc"), date = LocalDate(2024, 6, 10)),
        )

        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))
        assertEquals(1.0, status.utilization, 0.001, "Exactly at budget = 100%")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Pending vs cleared transactions in totals
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun pendingTransactions_includedInTotals() {
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(5000),
                date = LocalDate(2024, 6, 10),
                status = TransactionStatus.CLEARED,
            ),
            TestFixtures.createExpense(
                amount = Cents(3000),
                date = LocalDate(2024, 6, 15),
                status = TransactionStatus.PENDING,
            ),
        )

        val total = FinancialAggregator.totalSpending(
            transactions,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 30),
        )

        assertEquals(Cents(8000), total, "Both pending and cleared included in totals")
    }

    @Test
    fun voidTransactions_excludedFromTotals() {
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(5000),
                date = LocalDate(2024, 6, 10),
                status = TransactionStatus.CLEARED,
            ),
            TestFixtures.createExpense(
                amount = Cents(3000),
                date = LocalDate(2024, 6, 15),
                status = TransactionStatus.VOID,
            ),
        )

        val total = FinancialAggregator.totalSpending(
            transactions,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 30),
        )

        assertEquals(Cents(5000), total, "Void transactions excluded")
    }

    @Test
    fun reconciledTransactions_includedInTotals() {
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(5000),
                date = LocalDate(2024, 6, 10),
                status = TransactionStatus.RECONCILED,
            ),
        )

        val total = FinancialAggregator.totalSpending(
            transactions,
            LocalDate(2024, 6, 1),
            LocalDate(2024, 6, 30),
        )

        assertEquals(Cents(5000), total, "Reconciled transactions included")
    }

    @Test
    fun budgetCalculation_pendingAndCleared_bothCountTowardSpending() {
        val catId = SyncId("cat-dining")
        val budget = TestFixtures.createBudget(categoryId = catId, amount = Cents(20000))
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(8000),
                categoryId = catId,
                date = LocalDate(2024, 6, 5),
                status = TransactionStatus.CLEARED,
            ),
            TestFixtures.createExpense(
                amount = Cents(5000),
                categoryId = catId,
                date = LocalDate(2024, 6, 15),
                status = TransactionStatus.PENDING,
            ),
        )

        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))
        assertEquals(Cents(13000), status.spent, "Pending + cleared = $130 total")
    }
}
