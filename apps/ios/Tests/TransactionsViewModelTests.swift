// SPDX-License-Identifier: BUSL-1.1

// TransactionsViewModelTests.swift
// FinanceTests
//
// Tests for TransactionsViewModel — loading, search filtering, deletion,
// and grouped date display.

import XCTest
@testable import FinanceApp

final class TransactionsViewModelTests: XCTestCase {

    // MARK: - Test: loadTransactions populates the list

    @MainActor
    func testLoadTransactionsPopulatesList() async {
        let repo = StubTransactionRepository()
        repo.transactionsToReturn = SampleData.allTransactions
        let vm = TransactionsViewModel(repository: repo)

        await vm.loadTransactions()

        XCTAssertEqual(vm.transactions.count, SampleData.allTransactions.count,
                       "Should load all transactions from the repository")
        XCTAssertFalse(vm.isLoading, "isLoading should be false after loading")
    }

    // MARK: - Test: search by payee name

    @MainActor
    func testSearchTextFiltersByPayee() async {
        let repo = StubTransactionRepository()
        repo.transactionsToReturn = SampleData.allTransactions
        let vm = TransactionsViewModel(repository: repo)

        await vm.loadTransactions()

        vm.searchText = "Whole Foods"

        XCTAssertEqual(vm.filteredTransactions.count, 1,
                       "Should find exactly 1 transaction matching payee 'Whole Foods'")
        XCTAssertEqual(vm.filteredTransactions.first?.payee, "Whole Foods")
    }

    // MARK: - Test: search by category name

    @MainActor
    func testSearchTextFiltersByCategory() async {
        let repo = StubTransactionRepository()
        repo.transactionsToReturn = SampleData.allTransactions
        let vm = TransactionsViewModel(repository: repo)

        await vm.loadTransactions()

        vm.searchText = "Entertainment"

        XCTAssertEqual(vm.filteredTransactions.count, 1,
                       "Should find exactly 1 transaction in 'Entertainment' category")
        XCTAssertEqual(vm.filteredTransactions.first?.category, "Entertainment")
    }

    // MARK: - Test: empty search returns all transactions

    @MainActor
    func testEmptySearchReturnsAllTransactions() async {
        let repo = StubTransactionRepository()
        repo.transactionsToReturn = SampleData.allTransactions
        let vm = TransactionsViewModel(repository: repo)

        await vm.loadTransactions()

        vm.searchText = ""

        XCTAssertEqual(vm.filteredTransactions.count, SampleData.allTransactions.count,
                       "Empty search text should return all transactions")
    }

    // MARK: - Test: deleteTransaction removes item and calls repository

    @MainActor
    func testDeleteTransactionRemovesItem() async {
        let repo = StubTransactionRepository()
        repo.transactionsToReturn = SampleData.allTransactions
        let vm = TransactionsViewModel(repository: repo)

        await vm.loadTransactions()
        let countBefore = vm.transactions.count

        await vm.deleteTransaction(id: "t1")

        XCTAssertEqual(vm.transactions.count, countBefore - 1,
                       "Should have one fewer transaction after deletion")
        XCTAssertNil(vm.transactions.first { $0.id == "t1" },
                     "Deleted transaction should no longer appear in the list")
        XCTAssertEqual(repo.deletedTransactionIds, ["t1"],
                       "Repository should record the deleted transaction id")
    }
}
