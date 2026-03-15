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
        XCTAssertNotNil(vm.errorMessage,
                        "Error message should be set when repository throws")
        XCTAssertFalse(vm.isLoading, "isLoading should be false after error")
    }

    // MARK: - Test: successful load clears errorMessage

    @MainActor
    func testSuccessfulLoadClearsErrorMessage() async {
        let repo = StubAccountRepository()
        repo.errorToThrow = TestError.simulated
        let vm = AccountsViewModel(repository: repo)

        // First load fails
        await vm.loadAccounts()
        XCTAssertNotNil(vm.errorMessage, "Error message should be set after failure")

        // Second load succeeds
        repo.errorToThrow = nil
        repo.accountsToReturn = SampleData.allAccounts
        await vm.loadAccounts()

        XCTAssertNil(vm.errorMessage,
                     "Error message should be cleared after successful load")
        XCTAssertFalse(vm.accountGroups.isEmpty,
                       "Account groups should be populated after successful reload")
    }
}
