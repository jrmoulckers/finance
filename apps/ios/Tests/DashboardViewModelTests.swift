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

        // 12_450_00 + 25_000_00 + (-1_200_00) + 18_500_00 + 10_000_00 = 64_750_00
        let expected: Int64 = 12_450_00 + 25_000_00 + (-1_200_00) + 18_500_00 + 10_000_00
        XCTAssertEqual(vm.netWorth, expected,
                       "Net worth should be the sum of all account balances")
    }

    // MARK: - Test: monthly income sums only income transactions

    @MainActor
    func testMonthlyIncomeCalculation() async {
        let vm = makeDashboardVM()

        await vm.loadDashboard()

        // Only the income transaction (Payroll): 4_250_00
        // Dashboard uses getRecentTransactions(limit: 5) which returns all 5 sorted by date
        let incomeItems = vm.recentTransactions.filter { $0.type == .income }
        let expected = incomeItems.reduce(Int64(0)) { $0 + $1.amountMinorUnits }
        XCTAssertEqual(vm.monthlyIncome, expected,
                       "Monthly income should sum only income-type transactions")
        XCTAssertTrue(vm.monthlyIncome > 0, "Monthly income should be positive")
    }

    // MARK: - Test: monthly expenses sums only expense transactions as positive

    @MainActor
    func testMonthlyExpensesCalculation() async {
        let vm = makeDashboardVM()

        await vm.loadDashboard()

        let expenseItems = vm.recentTransactions.filter { $0.isExpense }
        let expected = expenseItems.reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) }
        XCTAssertEqual(vm.monthlyExpenses, expected,
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
}
