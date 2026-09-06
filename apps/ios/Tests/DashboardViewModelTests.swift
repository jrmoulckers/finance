// SPDX-License-Identifier: BUSL-1.1

// DashboardViewModelTests.swift
// FinanceTests
//
// Tests for DashboardViewModel — data loading, computed aggregates, and error handling.

import XCTest
@testable import FinanceApp

final class DashboardViewModelTests: XCTestCase {

    // MARK: - Helpers

    @MainActor
    private func makeDashboardVM(
        accounts: [AccountItem] = SampleData.allAccounts,
        transactions: [TransactionItem] = SampleData.allTransactions,
        budgets: [BudgetItem] = SampleData.allBudgets,
        accountError: Error? = nil,
        transactionError: Error? = nil,
        budgetError: Error? = nil
    ) -> DashboardViewModel {
        let accountRepo = StubAccountRepository()
        accountRepo.accountsToReturn = accounts
        accountRepo.errorToThrow = accountError

        let transactionRepo = StubTransactionRepository()
        transactionRepo.transactionsToReturn = transactions
        transactionRepo.errorToThrow = transactionError

        let budgetRepo = StubBudgetRepository()
        budgetRepo.budgetsToReturn = budgets
        budgetRepo.errorToThrow = budgetError

        return DashboardViewModel(
            accountRepository: accountRepo,
            transactionRepository: transactionRepo,
            budgetRepository: budgetRepo
        )
    }

    private func currentMonthTransaction(
        id: String,
        amountMinorUnits: Int64,
        type: TransactionTypeUI
    ) -> TransactionItem {
        TransactionItem(
            id: id,
            payee: "Current Month",
            category: "Test",
            amountMinorUnits: amountMinorUnits,
            currencyCode: "USD",
            date: .now,
            type: type
        )
    }

    // MARK: - Test: loadDashboard populates all sections

    @MainActor
    func testLoadDashboardPopulatesAllSections() async {
        let vm = makeDashboardVM()

        await vm.loadDashboard()

        XCTAssertFalse(vm.accounts.isEmpty, "Accounts should be populated")
        XCTAssertFalse(vm.recentTransactions.isEmpty, "Recent transactions should be populated")
        XCTAssertFalse(vm.budgets.isEmpty, "Budgets should be populated")
        XCTAssertFalse(vm.isLoading, "isLoading should be false after load")
        XCTAssertNil(vm.errorMessage, "errorMessage should be nil on success")
    }

    // MARK: - Test: net worth is the sum of all account balances

    @MainActor
    func testNetWorthCalculation() async {
        let vm = makeDashboardVM()

        await vm.loadDashboard()

        XCTAssertEqual(
            vm.netWorth,
            64_750_00,
            "Liabilities should reduce net worth regardless of their stored sign"
        )
    }

    // MARK: - Test: monthly income sums only income transactions

    @MainActor
    func testMonthlyIncomeCalculation() async {
        let transactions = [
            currentMonthTransaction(
                id: "current-income",
                amountMinorUnits: 4_250_00,
                type: .income
            ),
            currentMonthTransaction(
                id: "current-expense",
                amountMinorUnits: -125_00,
                type: .expense
            ),
        ]
        let vm = makeDashboardVM(transactions: transactions)

        await vm.loadDashboard()

        XCTAssertEqual(vm.monthlyIncome, 4_250_00,
                       "Monthly income should sum only income-type transactions")
        XCTAssertTrue(vm.monthlyIncome > 0, "Monthly income should be positive")
    }

    // MARK: - Test: monthly expenses sums only expense transactions as positive

    @MainActor
    func testMonthlyExpensesCalculation() async {
        let transactions = [
            currentMonthTransaction(
                id: "current-income",
                amountMinorUnits: 4_250_00,
                type: .income
            ),
            currentMonthTransaction(
                id: "current-expense",
                amountMinorUnits: -146_39,
                type: .expense
            ),
        ]
        let vm = makeDashboardVM(transactions: transactions)

        await vm.loadDashboard()

        XCTAssertEqual(vm.monthlyExpenses, 146_39,
                       "Monthly expenses should sum expense amounts as positive values")
        XCTAssertTrue(vm.monthlyExpenses > 0, "Monthly expenses should be positive")
    }

    // MARK: - Test: error from any repository sets errorMessage

    @MainActor
    func testErrorHandlingSetsErrorMessage() async {
        let vm = makeDashboardVM(accountError: TestError.simulated)

        await vm.loadDashboard()

        XCTAssertNotNil(vm.errorMessage,
                        "Error message should be set when a repository throws")
        XCTAssertFalse(vm.isLoading, "isLoading should be false after error")
    }
    // MARK: - Test: empty data shows zeros for all aggregates

    @MainActor
    func testEmptyDataShowsZeros() async {
        let vm = makeDashboardVM(accounts: [], transactions: [], budgets: [])

        await vm.loadDashboard()

        XCTAssertEqual(vm.netWorth, 0,
                       "Net worth should be 0 with no accounts")
        XCTAssertEqual(vm.monthlyIncome, 0,
                       "Monthly income should be 0 with no transactions")
        XCTAssertEqual(vm.monthlyExpenses, 0,
                       "Monthly expenses should be 0 with no transactions")
        XCTAssertTrue(vm.accounts.isEmpty, "Accounts should be empty")
        XCTAssertTrue(vm.recentTransactions.isEmpty, "Recent transactions should be empty")
        XCTAssertTrue(vm.budgets.isEmpty, "Budgets should be empty")
    }

    // MARK: - Test: net worth with only negative balances

    @MainActor
    func testNetWorthWithOnlyNegativeBalances() async {
        let creditCard = AccountItem(
            id: "cc1", name: "Card A",
            balanceMinorUnits: -500_00, currencyCode: "USD",
            type: .creditCard, icon: "creditcard", isArchived: false
        )
        let loan = AccountItem(
            id: "l1", name: "Car Loan",
            balanceMinorUnits: -15_000_00, currencyCode: "USD",
            type: .loan, icon: "percent", isArchived: false
        )
        let vm = makeDashboardVM(accounts: [creditCard, loan], transactions: [], budgets: [])

        await vm.loadDashboard()

        XCTAssertEqual(vm.netWorth, -15_500_00,
                       "Net worth should be negative when all balances are negative")
    }

    // MARK: - Test: net worth with a single account

    @MainActor
    func testNetWorthWithSingleAccount() async {
        let vm = makeDashboardVM(
            accounts: [SampleData.checkingAccount],
            transactions: [],
            budgets: []
        )

        await vm.loadDashboard()

        XCTAssertEqual(vm.netWorth, SampleData.checkingAccount.balanceMinorUnits,
                       "Net worth should equal the single account's balance")
    }

    // MARK: - Test: transaction error only sets errorMessage

    @MainActor
    func testTransactionErrorOnlySetsErrorMessage() async {
        let vm = makeDashboardVM(transactionError: TestError.simulated)

        await vm.loadDashboard()

        XCTAssertNotNil(vm.errorMessage,
                         "Error message should be set when transaction repository throws")
        XCTAssertFalse(vm.isLoading, "isLoading should be false after error")
    }

    // MARK: - Test: budget error only sets errorMessage

    @MainActor
    func testBudgetErrorOnlySetsErrorMessage() async {
        let vm = makeDashboardVM(budgetError: TestError.simulated)

        await vm.loadDashboard()

        XCTAssertNotNil(vm.errorMessage,
                         "Error message should be set when budget repository throws")
        XCTAssertFalse(vm.isLoading, "isLoading should be false after error")
    }

    // MARK: - Test: recent transactions limited to 5

    @MainActor
    func testRecentTransactionsLimitedToFive() async {
        // Create 8 transactions so the limit of 5 is exercised
        var manyTransactions: [TransactionItem] = []
        for i in 0..<8 {
            manyTransactions.append(TransactionItem(
                id: "tx\(i)", payee: "Payee \(i)",
                category: "General", accountName: "Checking",
                amountMinorUnits: -10_00 * Int64(i + 1), currencyCode: "USD",
                date: Date(timeIntervalSince1970: Double(1_700_000_000 + i * 86400)),
                type: .expense, status: .cleared
            ))
        }
        let vm = makeDashboardVM(transactions: manyTransactions)

        await vm.loadDashboard()

        XCTAssertEqual(vm.recentTransactions.count, 5,
                       "Dashboard should show at most 5 recent transactions")
    }

    // MARK: - Net Worth Trend (#2116)

    @MainActor
    func testNetWorthTrendPointsEndAtCurrentNetWorth() async {
        let vm = makeDashboardVM()

        await vm.loadDashboard()

        XCTAssertTrue(vm.hasNetWorthTrend)
        XCTAssertFalse(vm.netWorthTrendPoints.isEmpty)
        XCTAssertEqual(vm.netWorthTrendPoints.last?.valueMinorUnits, vm.netWorth)
    }

    @MainActor
    func testNetWorthTrendRangeControlsPointCount() async {
        let vm = makeDashboardVM()
        await vm.loadDashboard()

        vm.netWorthTrendRange = .threeMonths
        XCTAssertEqual(vm.netWorthTrendPoints.count, 3)

        vm.netWorthTrendRange = .oneYear
        XCTAssertEqual(vm.netWorthTrendPoints.count, 12)
    }

    @MainActor
    func testNetWorthProjectionExtendsFromHistory() async {
        let vm = makeDashboardVM()
        await vm.loadDashboard()

        XCTAssertEqual(vm.netWorthProjectionPoints.count, 12)
        XCTAssertTrue(vm.netWorthProjectionPoints.allSatisfy(\.isProjected))
    }

    @MainActor
    func testNoNetWorthTrendWithoutAccounts() async {
        let vm = makeDashboardVM(accounts: [], transactions: [], budgets: [])
        await vm.loadDashboard()

        XCTAssertFalse(vm.hasNetWorthTrend)
    }
}
