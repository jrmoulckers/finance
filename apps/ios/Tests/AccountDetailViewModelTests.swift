// SPDX-License-Identifier: BUSL-1.1

// AccountDetailViewModelTests.swift
// FinanceTests
//
// Tests for AccountDetailViewModel — loading account transactions,
// error handling, and date-grouped display.

import XCTest
@testable import FinanceApp

final class AccountDetailViewModelTests: XCTestCase {

    // MARK: - Test: loadTransactions populates list

    @MainActor
    func testLoadTransactionsPopulatesList() async {
        let repo = StubTransactionRepository()
        repo.transactionsToReturn = [
            SampleData.expenseTransaction,
            SampleData.incomeTransaction,
        ]
        let vm = AccountDetailViewModel(repository: repo)

        await vm.loadTransactions(accountId: "a1")

        XCTAssertEqual(vm.transactions.count, 2,
                       "Should load all transactions for the account")
        XCTAssertFalse(vm.isLoading, "isLoading should be false after loading")
        XCTAssertNil(vm.errorMessage, "errorMessage should be nil on success")
    }

    // MARK: - Test: load with error sets errorMessage and clears transactions

    @MainActor
    func testLoadTransactionsWithError() async {
        let repo = StubTransactionRepository()
        repo.errorToThrow = TestError.simulated
        let vm = AccountDetailViewModel(repository: repo)

        await vm.loadTransactions(accountId: "a1")

        XCTAssertTrue(vm.transactions.isEmpty,
                       "Transactions should be empty when repository throws")
        XCTAssertNotNil(vm.errorMessage,
                         "Error message should be set when repository throws")
        XCTAssertFalse(vm.isLoading, "isLoading should be false after error")
    }

    // MARK: - Test: groupedTransactions produces date-sorted groups

    @MainActor
    func testGroupedTransactionsStructure() async {
        let repo = StubTransactionRepository()
        // Transactions on two different days
        let dayA = TransactionItem(
            id: "da1", payee: "Merchant A", category: "Shopping",
            accountName: "Checking", amountMinorUnits: -50_00,
            currencyCode: "USD",
            date: Date(timeIntervalSince1970: 1_700_000_000),
            type: .expense, status: .cleared
        )
        let dayB = TransactionItem(
            id: "db1", payee: "Merchant B", category: "Dining",
            accountName: "Checking", amountMinorUnits: -25_00,
            currencyCode: "USD",
            date: Date(timeIntervalSince1970: 1_700_200_000),
            type: .expense, status: .cleared
        )
        repo.transactionsToReturn = [dayA, dayB]
        let vm = AccountDetailViewModel(repository: repo)

        await vm.loadTransactions(accountId: "a1")

        let groups = vm.groupedTransactions
        XCTAssertEqual(groups.count, 2,
                       "Should have 2 date groups for transactions on different days")

        // Verify sorted most recent first
        if groups.count == 2 {
            XCTAssertGreaterThan(groups[0].date, groups[1].date,
                                  "Groups should be sorted most recent first")
        }
    }
}
