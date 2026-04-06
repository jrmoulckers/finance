// SPDX-License-Identifier: BUSL-1.1

// AccountEditViewModelTests.swift
// FinanceTests
//
// Tests for AccountEditViewModel — validation, save, and change tracking.

import XCTest
@testable import FinanceApp

final class AccountEditViewModelTests: XCTestCase {

    // MARK: - Test: initial state matches the original account

    @MainActor
    func testInitialStateMatchesOriginal() {
        let repo = StubAccountRepository()
        let account = SampleData.checkingAccount
        let vm = AccountEditViewModel(repository: repo, account: account)

        XCTAssertEqual(vm.name, account.name)
        XCTAssertEqual(vm.selectedType, account.type)
        XCTAssertEqual(vm.currencyCode, account.currencyCode)
        XCTAssertTrue(vm.notes.isEmpty)
        XCTAssertFalse(vm.hasChanges, "No changes should be detected initially")
    }

    // MARK: - Test: hasChanges detects name change

    @MainActor
    func testHasChangesDetectsNameChange() {
        let repo = StubAccountRepository()
        let vm = AccountEditViewModel(repository: repo, account: SampleData.checkingAccount)

        vm.name = "Renamed Checking"

        XCTAssertTrue(vm.hasChanges, "Should detect name change")
    }

    // MARK: - Test: hasChanges detects type change

    @MainActor
    func testHasChangesDetectsTypeChange() {
        let repo = StubAccountRepository()
        let vm = AccountEditViewModel(repository: repo, account: SampleData.checkingAccount)

        vm.selectedType = .savings

        XCTAssertTrue(vm.hasChanges, "Should detect type change")
    }

    // MARK: - Test: hasChanges detects currency change

    @MainActor
    func testHasChangesDetectsCurrencyChange() {
        let repo = StubAccountRepository()
        let vm = AccountEditViewModel(repository: repo, account: SampleData.checkingAccount)

        vm.currencyCode = "EUR"

        XCTAssertTrue(vm.hasChanges, "Should detect currency change")
    }

    // MARK: - Test: hasChanges detects notes added

    @MainActor
    func testHasChangesDetectsNotes() {
        let repo = StubAccountRepository()
        let vm = AccountEditViewModel(repository: repo, account: SampleData.checkingAccount)

        vm.notes = "Some note"

        XCTAssertTrue(vm.hasChanges, "Should detect notes change")
    }

    // MARK: - Test: save with empty name fails validation

    @MainActor
    func testSaveWithEmptyNameFailsValidation() async {
        let repo = StubAccountRepository()
        let vm = AccountEditViewModel(repository: repo, account: SampleData.checkingAccount)

        vm.name = "   "

        let result = await vm.save()

        XCTAssertFalse(result, "Save should fail with empty name")
        XCTAssertTrue(vm.showingValidationError)
        XCTAssertTrue(repo.updatedAccounts.isEmpty, "Repository should not be called")
    }

    // MARK: - Test: save with name exceeding 100 characters fails validation

    @MainActor
    func testSaveWithLongNameFailsValidation() async {
        let repo = StubAccountRepository()
        let vm = AccountEditViewModel(repository: repo, account: SampleData.checkingAccount)

        vm.name = String(repeating: "A", count: 101)

        let result = await vm.save()

        XCTAssertFalse(result, "Save should fail with name > 100 chars")
        XCTAssertTrue(vm.showingValidationError)
    }

    // MARK: - Test: successful save calls repository and returns true

    @MainActor
    func testSuccessfulSave() async {
        let repo = StubAccountRepository()
        let vm = AccountEditViewModel(repository: repo, account: SampleData.checkingAccount)

        vm.name = "Renamed Checking"

        let result = await vm.save()

        XCTAssertTrue(result, "Save should succeed")
        XCTAssertEqual(repo.updatedAccounts.count, 1, "Repository should receive one update")
        XCTAssertEqual(repo.updatedAccounts.first?.name, "Renamed Checking")
        XCTAssertFalse(vm.isSaving, "isSaving should be false after completion")
    }

    // MARK: - Test: save with repository error returns false

    @MainActor
    func testSaveWithRepositoryErrorReturnsFalse() async {
        let repo = StubAccountRepository()
        repo.errorToThrow = TestError.simulated
        let vm = AccountEditViewModel(repository: repo, account: SampleData.checkingAccount)

        vm.name = "Renamed"

        let result = await vm.save()

        XCTAssertFalse(result, "Save should fail on repository error")
        XCTAssertNotNil(vm.errorMessage, "Error message should be set")
    }

    // MARK: - Test: updatedAccount reflects current form state

    @MainActor
    func testUpdatedAccountReflectsFormState() {
        let repo = StubAccountRepository()
        let account = SampleData.checkingAccount
        let vm = AccountEditViewModel(repository: repo, account: account)

        vm.name = "New Name"
        vm.selectedType = .savings
        vm.currencyCode = "EUR"

        let updated = vm.updatedAccount
        XCTAssertEqual(updated.id, account.id, "ID should be preserved")
        XCTAssertEqual(updated.name, "New Name")
        XCTAssertEqual(updated.type, .savings)
        XCTAssertEqual(updated.currencyCode, "EUR")
        XCTAssertEqual(updated.balanceMinorUnits, account.balanceMinorUnits, "Balance should be preserved")
        XCTAssertEqual(updated.icon, AccountTypeUI.savings.systemImage, "Icon should update with type")
    }

    // MARK: - Test: dismissError clears message

    @MainActor
    func testDismissErrorClearsMessage() async {
        let repo = StubAccountRepository()
        repo.errorToThrow = TestError.simulated
        let vm = AccountEditViewModel(repository: repo, account: SampleData.checkingAccount)
        vm.name = "Change"

        _ = await vm.save()
        XCTAssertTrue(vm.showError, "Error should be visible")

        vm.dismissError()
        XCTAssertFalse(vm.showError, "Error should be dismissed")
    }

    // MARK: - Test: save trims whitespace from name

    @MainActor
    func testSaveTrimsWhitespace() async {
        let repo = StubAccountRepository()
        let vm = AccountEditViewModel(repository: repo, account: SampleData.checkingAccount)

        vm.name = "  Padded Name  "

        let result = await vm.save()

        XCTAssertTrue(result)
        XCTAssertEqual(repo.updatedAccounts.first?.name, "Padded Name", "Name should be trimmed")
    }
}
