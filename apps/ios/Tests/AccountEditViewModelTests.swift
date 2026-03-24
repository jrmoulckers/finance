// SPDX-License-Identifier: BUSL-1.1
// AccountEditViewModelTests.swift
import XCTest
@testable import FinanceApp

final class AccountEditViewModelTests: XCTestCase {
    @MainActor private func makeVM(account: AccountItem = SampleData.checkingAccount, repo: StubAccountRepository? = nil) -> (vm: AccountEditViewModel, repo: StubAccountRepository) { let r = repo ?? StubAccountRepository(); r.accountsToReturn = SampleData.allAccounts; return (AccountEditViewModel(repository: r, account: account), r) }
    @MainActor func testInitPreFills() { let (vm, _) = makeVM(); XCTAssertEqual(vm.name, SampleData.checkingAccount.name); XCTAssertEqual(vm.accountType, SampleData.checkingAccount.type); XCTAssertEqual(vm.notes, ""); XCTAssertEqual(vm.original.id, SampleData.checkingAccount.id) }
    @MainActor func testInitNotes() { let a = AccountItem(id: "n1", name: "N", balanceMinorUnits: 100, currencyCode: "USD", type: .savings, icon: "banknote", isArchived: false, notes: "Hi"); let (vm, _) = makeVM(account: a); XCTAssertEqual(vm.notes, "Hi") }
    @MainActor func testNoChanges() { let (vm, _) = makeVM(); XCTAssertFalse(vm.hasChanges) }
    @MainActor func testNameChange() { let (vm, _) = makeVM(); vm.name = "X"; XCTAssertTrue(vm.hasChanges) }
    @MainActor func testTypeChange() { let (vm, _) = makeVM(); vm.accountType = .savings; XCTAssertTrue(vm.hasChanges) }
    @MainActor func testNotesChange() { let (vm, _) = makeVM(); vm.notes = "n"; XCTAssertTrue(vm.hasChanges) }
    @MainActor func testEmptyNameFails() async { let (vm, r) = makeVM(); vm.name = ""; XCTAssertFalse(await vm.save()); XCTAssertTrue(vm.showingValidationError); XCTAssertTrue(r.updatedAccounts.isEmpty) }
    @MainActor func testWhitespaceNameFails() async { let (vm, r) = makeVM(); vm.name = "   "; XCTAssertFalse(await vm.save()); XCTAssertTrue(vm.showingValidationError); XCTAssertTrue(r.updatedAccounts.isEmpty) }
    @MainActor func testSaveSucceeds() async { let (vm, r) = makeVM(); vm.name = "Updated"; XCTAssertTrue(await vm.save()); XCTAssertEqual(r.updatedAccounts.count, 1); XCTAssertEqual(r.updatedAccounts.first?.name, "Updated") }
    @MainActor func testSavePreservesBalance() async { let (vm, r) = makeVM(); vm.name = "X"; _ = await vm.save(); XCTAssertEqual(r.updatedAccounts.first?.balanceMinorUnits, SampleData.checkingAccount.balanceMinorUnits) }
    @MainActor func testSaveUpdatesType() async { let (vm, r) = makeVM(); vm.name = "X"; vm.accountType = .savings; _ = await vm.save(); XCTAssertEqual(r.updatedAccounts.first?.type, .savings) }
    @MainActor func testSaveTrims() async { let (vm, r) = makeVM(); vm.name = "  T  "; vm.notes = "  N  "; _ = await vm.save(); XCTAssertEqual(r.updatedAccounts.first?.name, "T"); XCTAssertEqual(r.updatedAccounts.first?.notes, "N") }
    @MainActor func testSaveNilNotes() async { let (vm, r) = makeVM(); vm.name = "X"; vm.notes = "   "; _ = await vm.save(); XCTAssertNil(r.updatedAccounts.first?.notes) }
    @MainActor func testSaveFailure() async { let r = StubAccountRepository(); r.errorToThrow = TestError.simulated; let (vm, _) = makeVM(repo: r); vm.name = "X"; XCTAssertFalse(await vm.save()); XCTAssertNotNil(vm.errorMessage); XCTAssertFalse(vm.isSaving) }
    @MainActor func testArchive() async { let (vm, r) = makeVM(); XCTAssertTrue(await vm.archive()); XCTAssertEqual(r.archivedAccountIds, [SampleData.checkingAccount.id]) }
    @MainActor func testArchiveFailure() async { let r = StubAccountRepository(); r.errorToThrow = TestError.simulated; let (vm, _) = makeVM(repo: r); XCTAssertFalse(await vm.archive()); XCTAssertNotNil(vm.errorMessage); XCTAssertFalse(vm.isArchiving) }
    @MainActor func testUnarchive() async { let (vm, r) = makeVM(account: SampleData.archivedAccount); XCTAssertTrue(await vm.unarchive()); XCTAssertEqual(r.unarchivedAccountIds, [SampleData.archivedAccount.id]) }
    @MainActor func testUnarchiveFailure() async { let r = StubAccountRepository(); r.errorToThrow = TestError.simulated; let (vm, _) = makeVM(account: SampleData.archivedAccount, repo: r); XCTAssertFalse(await vm.unarchive()); XCTAssertNotNil(vm.errorMessage); XCTAssertFalse(vm.isArchiving) }
    @MainActor func testIsProcessing() { let (vm, _) = makeVM(); XCTAssertFalse(vm.isProcessing); vm.isSaving = true; XCTAssertTrue(vm.isProcessing); vm.isSaving = false; vm.isArchiving = true; XCTAssertTrue(vm.isProcessing) }
    @MainActor func testDismissError() { let (vm, _) = makeVM(); vm.errorMessage = "e"; XCTAssertTrue(vm.showError); vm.dismissError(); XCTAssertNil(vm.errorMessage); XCTAssertFalse(vm.showError) }
}
