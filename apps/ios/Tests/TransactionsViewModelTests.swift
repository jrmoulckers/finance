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
    // MARK: - Test: load with repository error produces empty list

    @MainActor
    func testLoadTransactionsWithError() async {
        let repo = StubTransactionRepository()
        repo.errorToThrow = TestError.simulated
        let vm = TransactionsViewModel(repository: repo)

        await vm.loadTransactions()

        XCTAssertTrue(vm.transactions.isEmpty,
                       "Transactions should be empty when repository throws")
        XCTAssertFalse(vm.isLoading, "isLoading should be false after error")
    }

    // MARK: - Test: search filters by account name

    @MainActor
    func testSearchByAccountName() async {
        let repo = StubTransactionRepository()
        repo.transactionsToReturn = SampleData.allTransactions
        let vm = TransactionsViewModel(repository: repo)

        await vm.loadTransactions()

        vm.searchText = "Travel Card"

        XCTAssertEqual(vm.filteredTransactions.count, 2,
                       "Should find 2 transactions for 'Travel Card' account")
        XCTAssertTrue(
            vm.filteredTransactions.allSatisfy { $0.accountName == "Travel Card" },
            "All filtered transactions should belong to Travel Card"
        )
    }

    // MARK: - Test: search is case-insensitive

    @MainActor
    func testSearchCaseInsensitive() async {
        let repo = StubTransactionRepository()
        repo.transactionsToReturn = SampleData.allTransactions
        let vm = TransactionsViewModel(repository: repo)

        await vm.loadTransactions()

        vm.searchText = "whole foods"

        XCTAssertEqual(vm.filteredTransactions.count, 1,
                       "Case-insensitive search should find 'Whole Foods'")
        XCTAssertEqual(vm.filteredTransactions.first?.payee, "Whole Foods")
    }

    // MARK: - Test: grouped transactions sorted by date descending

    @MainActor
    func testGroupedTransactionsSortedByDateDescending() async {
        let repo = StubTransactionRepository()
        repo.transactionsToReturn = SampleData.allTransactions
        let vm = TransactionsViewModel(repository: repo)

        await vm.loadTransactions()

        let groups = vm.groupedTransactions
        guard groups.count >= 2 else {
            XCTFail("Expected at least 2 date groups")
            return
        }

        // Each group's date should be >= the next group's date
        for i in 0..<(groups.count - 1) {
            XCTAssertGreaterThanOrEqual(
                groups[i].date, groups[i + 1].date,
                "Date groups should be sorted most recent first"
            )
        }
    }

    // MARK: - Test: grouped transactions group by calendar day

    @MainActor
    func testGroupedTransactionsGroupByDay() async {
        let repo = StubTransactionRepository()
        // Two transactions on the same day, one on a different day
        let sameDay = TransactionItem(
            id: "sd1", payee: "Store A", category: "Shopping",
            accountName: "Checking", amountMinorUnits: -20_00,
            currencyCode: "USD",
            date: Date(timeIntervalSince1970: 1_700_000_000),
            type: .expense, status: .cleared
        )
        let sameDayB = TransactionItem(
            id: "sd2", payee: "Store B", category: "Shopping",
            accountName: "Checking", amountMinorUnits: -30_00,
            currencyCode: "USD",
            date: Date(timeIntervalSince1970: 1_700_000_100),
            type: .expense, status: .cleared
        )
        let differentDay = TransactionItem(
            id: "dd1", payee: "Store C", category: "Shopping",
            accountName: "Checking", amountMinorUnits: -15_00,
            currencyCode: "USD",
            date: Date(timeIntervalSince1970: 1_700_100_000),
            type: .expense, status: .cleared
        )
        repo.transactionsToReturn = [sameDay, sameDayB, differentDay]
        let vm = TransactionsViewModel(repository: repo)

        await vm.loadTransactions()

        let groups = vm.groupedTransactions
        XCTAssertEqual(groups.count, 2,
                       "Should have 2 date groups for transactions on 2 different days")

        // Find the group with 2 transactions
        let largerGroup = groups.first { $0.transactions.count == 2 }
        XCTAssertNotNil(largerGroup,
                        "One group should contain 2 same-day transactions")
    }

    // MARK: - Test: confirmDelete sets pending state

    @MainActor
    func testConfirmDeleteSetsPendingState() async {
        let repo = StubTransactionRepository()
        repo.transactionsToReturn = SampleData.allTransactions
        let vm = TransactionsViewModel(repository: repo)

        await vm.loadTransactions()

        vm.confirmDelete(id: "t1")

        XCTAssertEqual(vm.pendingDeleteId, "t1",
                       "Pending delete ID should be set")
        XCTAssertTrue(vm.showingDeleteConfirmation,
                       "Delete confirmation should be showing")
    }

    // MARK: - Test: deleteTransaction resets pendingDeleteId

    @MainActor
    func testDeleteTransactionResetsPendingDeleteId() async {
        let repo = StubTransactionRepository()
        repo.transactionsToReturn = SampleData.allTransactions
        let vm = TransactionsViewModel(repository: repo)

        await vm.loadTransactions()

        vm.confirmDelete(id: "t1")
        XCTAssertEqual(vm.pendingDeleteId, "t1")

        await vm.deleteTransaction(id: "t1")

        XCTAssertNil(vm.pendingDeleteId,
                     "Pending delete ID should be nil after deletion completes")
    }


    // MARK: - Pagination (#645)

    @MainActor
    func testLoadMoreAppendsTransactions() async {
        let repo = StubTransactionRepository()
        var txns: [TransactionItem] = []; for i in 0..<60 { txns.append(TransactionItem(id: "t\(i)", payee: "P\(i)", category: "S", accountName: "C", amountMinorUnits: -Int64(i * 100), currencyCode: "USD", date: Date(timeIntervalSince1970: Double(1_700_000_000 - i * 1000)), type: .expense, status: .cleared)) }
        repo.transactionsToReturn = txns; let vm = TransactionsViewModel(repository: repo)
        await vm.loadTransactions()
        XCTAssertEqual(vm.transactions.count, TransactionsViewModel.pageSize)
        XCTAssertTrue(vm.hasMorePages)
        await vm.loadMore()
        XCTAssertEqual(vm.transactions.count, txns.count)
        XCTAssertFalse(vm.hasMorePages)
    }

    @MainActor
    func testRefreshResetsPagination() async {
        let repo = StubTransactionRepository()
        var txns: [TransactionItem] = []; for i in 0..<60 { txns.append(TransactionItem(id: "t\(i)", payee: "P\(i)", category: "S", accountName: "C", amountMinorUnits: -Int64(i * 100), currencyCode: "USD", date: Date(timeIntervalSince1970: Double(1_700_000_000 - i * 1000)), type: .expense, status: .cleared)) }
        repo.transactionsToReturn = txns; let vm = TransactionsViewModel(repository: repo)
        await vm.loadTransactions(); await vm.loadMore()
        XCTAssertEqual(vm.transactions.count, 60)
        await vm.refresh()
        XCTAssertEqual(vm.transactions.count, TransactionsViewModel.pageSize)
    }

    @MainActor
    func testShouldLoadMoreNearEnd() async {
        let repo = StubTransactionRepository()
        var txns: [TransactionItem] = []; for i in 0..<20 { txns.append(TransactionItem(id: "t\(i)", payee: "P\(i)", category: "S", accountName: "C", amountMinorUnits: -Int64(i * 100), currencyCode: "USD", date: Date(timeIntervalSince1970: Double(1_700_000_000 - i * 1000)), type: .expense, status: .cleared)) }
        repo.transactionsToReturn = txns; let vm = TransactionsViewModel(repository: repo)
        await vm.loadTransactions()
        XCTAssertFalse(vm.shouldLoadMore(for: vm.transactions[0]))
        XCTAssertTrue(vm.shouldLoadMore(for: vm.transactions[vm.transactions.count - 1]))
    }

    @MainActor
    func testHasMorePagesFalseWhenPartialPage() async {
        let repo = StubTransactionRepository()
        repo.transactionsToReturn = [SampleData.expenseTransaction, SampleData.incomeTransaction]
        let vm = TransactionsViewModel(repository: repo)
        await vm.loadTransactions()
        XCTAssertFalse(vm.hasMorePages)
        XCTAssertEqual(vm.currentPage, 2)
    }
}
