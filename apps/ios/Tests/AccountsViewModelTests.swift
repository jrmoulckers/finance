// SPDX-License-Identifier: BUSL-1.1

// AccountsViewModelTests.swift
// FinanceTests
//
// Tests for AccountsViewModel — loading, grouping, deletion, and error handling.

import XCTest
@testable import FinanceApp

final class AccountsViewModelTests: XCTestCase {

    // MARK: - Test: loadAccounts populates account groups

    @MainActor
    func testLoadAccountsPopulatesGroups() async {
        let repo = StubAccountRepository()
        repo.accountsToReturn = SampleData.allAccounts
        let vm = AccountsViewModel(repository: repo)

        await vm.loadAccounts()

        XCTAssertFalse(vm.accountGroups.isEmpty, "Account groups should not be empty after loading")
    }

    // MARK: - Test: accounts are grouped correctly by type

    @MainActor
    func testAccountsGroupedByType() async {
        let repo = StubAccountRepository()
        repo.accountsToReturn = SampleData.allAccounts
        let vm = AccountsViewModel(repository: repo)

        await vm.loadAccounts()

        // Sample data: 1 checking, 2 savings, 1 credit card, 1 investment = 4 groups
        XCTAssertEqual(vm.accountGroups.count, 4, "Should have 4 account type groups")

        let savingsGroup = vm.accountGroups.first { $0.type == .savings }
        XCTAssertNotNil(savingsGroup, "Should have a savings group")
        XCTAssertEqual(savingsGroup?.accounts.count, 2, "Savings group should contain 2 accounts")

        let checkingGroup = vm.accountGroups.first { $0.type == .checking }
        XCTAssertNotNil(checkingGroup, "Should have a checking group")
        XCTAssertEqual(checkingGroup?.accounts.count, 1, "Checking group should contain 1 account")
    }

    // MARK: - Test: deleteAccount removes from list and calls repository

    @MainActor
    func testDeleteAccountRemovesFromList() async {
        let repo = StubAccountRepository()
        repo.accountsToReturn = SampleData.allAccounts
        let vm = AccountsViewModel(repository: repo)

        await vm.loadAccounts()
        let totalAccountsBefore = vm.accountGroups.flatMap(\.accounts).count

        // Delete the checking account (sole member of its group)
        await vm.deleteAccount(id: "a1")

        let totalAccountsAfter = vm.accountGroups.flatMap(\.accounts).count
        XCTAssertEqual(totalAccountsAfter, totalAccountsBefore - 1,
                       "Should have one fewer account after deletion")

        // The checking group should be removed entirely
        let checkingGroup = vm.accountGroups.first { $0.type == .checking }
        XCTAssertNil(checkingGroup,
                     "Checking group should be removed when its only account is deleted")

        // Verify the repository received the delete call
        XCTAssertEqual(repo.deletedAccountIds, ["a1"],
                       "Repository should record the deleted account id")
    }

    // MARK: - Test: isLoading toggles correctly

    @MainActor
    func testLoadingSetsIsLoadingCorrectly() async {
        let repo = StubAccountRepository()
        repo.accountsToReturn = SampleData.allAccounts
        let vm = AccountsViewModel(repository: repo)

        XCTAssertFalse(vm.isLoading, "isLoading should be false before loading")

        await vm.loadAccounts()

        XCTAssertFalse(vm.isLoading, "isLoading should be false after loading completes")
    }

    // MARK: - Test: repository error produces empty groups

    @MainActor
    func testErrorHandlingSetsEmptyAccounts() async {
        let repo = StubAccountRepository()
        repo.errorToThrow = TestError.simulated
        let vm = AccountsViewModel(repository: repo)

        await vm.loadAccounts()

        XCTAssertTrue(vm.accountGroups.isEmpty,
                      "Account groups should be empty when repository throws")
        XCTAssertFalse(vm.isLoading, "isLoading should be false after error")
    }

    // MARK: - Test: load with empty repository returns no groups

    @MainActor
    func testLoadAccountsWithEmptyRepository() async {
        let repo = StubAccountRepository()
        repo.accountsToReturn = []
        let vm = AccountsViewModel(repository: repo)

        await vm.loadAccounts()

        XCTAssertTrue(vm.accountGroups.isEmpty,
                       "Account groups should be empty when no accounts exist")
        XCTAssertFalse(vm.isLoading, "isLoading should be false after loading")
    }

    // MARK: - Test: delete account with repository error still removes from local state

    @MainActor
    func testDeleteAccountWithRepositoryError() async {
        let repo = StubAccountRepository()
        repo.accountsToReturn = SampleData.allAccounts
        let vm = AccountsViewModel(repository: repo)

        await vm.loadAccounts()

        // Configure error for the delete call
        repo.errorToThrow = TestError.simulated

        let countBefore = vm.accountGroups.flatMap(\.accounts).count
        await vm.deleteAccount(id: "a1")

        // Local state should still be updated for immediate UI feedback
        let countAfter = vm.accountGroups.flatMap(\.accounts).count
        XCTAssertEqual(countAfter, countBefore - 1,
                       "Local state should remove the account even on repository error")
    }

    // MARK: - Test: deleting a non-existent account leaves list unchanged

    @MainActor
    func testDeleteNonExistentAccountLeavesListUnchanged() async {
        let repo = StubAccountRepository()
        repo.accountsToReturn = SampleData.allAccounts
        let vm = AccountsViewModel(repository: repo)

        await vm.loadAccounts()

        let countBefore = vm.accountGroups.flatMap(\.accounts).count

        await vm.deleteAccount(id: "nonexistent")

        let countAfter = vm.accountGroups.flatMap(\.accounts).count
        XCTAssertEqual(countAfter, countBefore,
                       "Deleting a non-existent account should not change the list")
    }

    // MARK: - Test: load accounts with single type produces one group

    @MainActor
    func testLoadAccountsSingleTypeGroup() async {
        let repo = StubAccountRepository()
        repo.accountsToReturn = [SampleData.savingsAccount, SampleData.emergencyFundAccount]
        let vm = AccountsViewModel(repository: repo)

        await vm.loadAccounts()

        XCTAssertEqual(vm.accountGroups.count, 1,
                       "Should have exactly 1 group when all accounts share a type")
        XCTAssertEqual(vm.accountGroups.first?.type, .savings,
                       "The single group should be savings")
        XCTAssertEqual(vm.accountGroups.first?.accounts.count, 2,
                       "The savings group should contain both accounts")
    }
}
