// SPDX-License-Identifier: BUSL-1.1
// TransactionEditViewModelTests.swift
import XCTest
@testable import FinanceApp

final class TransactionEditViewModelTests: XCTestCase {
    @MainActor
    private func makeViewModel(transaction: TransactionItem = SampleData.expenseTransaction, transactionRepo: StubTransactionRepository = StubTransactionRepository(), accountRepo: StubAccountRepository? = nil) -> (vm: TransactionEditViewModel, transactionRepo: StubTransactionRepository, accountRepo: StubAccountRepository) {
        let accountRepo = accountRepo ?? { let r = StubAccountRepository(); r.accountsToReturn = SampleData.allAccounts; return r }()
        return (TransactionEditViewModel(transactionRepository: transactionRepo, accountRepository: accountRepo, transaction: transaction), transactionRepo, accountRepo)
    }

    @MainActor func testInitializationPreFillsFields() { let t = SampleData.expenseTransaction; let (vm,_,_) = makeViewModel(transaction: t); XCTAssertEqual(vm.payee, t.payee); XCTAssertEqual(vm.transactionType, t.type); XCTAssertEqual(vm.original.id, t.id) }
    @MainActor func testLoadDataResolvesPickerSelections() async { let (vm,_,_) = makeViewModel(); await vm.loadData(); XCTAssertEqual(vm.accounts.count, SampleData.allAccounts.count); XCTAssertNotNil(vm.selectedAccountId); XCTAssertNotNil(vm.selectedCategoryId) }
    @MainActor func testHasChangesReturnsFalseWhenUnmodified() async { let (vm,_,_) = makeViewModel(); await vm.loadData(); XCTAssertFalse(vm.hasChanges) }
    @MainActor func testHasChangesDetectsPayeeChange() async { let (vm,_,_) = makeViewModel(); await vm.loadData(); vm.payee = "Updated"; XCTAssertTrue(vm.hasChanges) }
    @MainActor func testHasChangesDetectsAmountChange() async { let (vm,_,_) = makeViewModel(); await vm.loadData(); vm.amountText = "999.99"; XCTAssertTrue(vm.hasChanges) }
    @MainActor func testHasChangesDetectsTypeChange() async { let (vm,_,_) = makeViewModel(); await vm.loadData(); vm.transactionType = .income; XCTAssertTrue(vm.hasChanges) }
    @MainActor func testHasChangesDetectsDateChange() async { let (vm,_,_) = makeViewModel(); await vm.loadData(); vm.date = Calendar.current.date(byAdding: .day, value: -5, to: vm.date)!; XCTAssertTrue(vm.hasChanges) }
    @MainActor func testValidationFailsWithEmptyAmount() async { let (vm,r,_) = makeViewModel(); await vm.loadData(); vm.amountText = ""; let ok = await vm.save(); XCTAssertFalse(ok); XCTAssertTrue(vm.showingValidationError); XCTAssertTrue(r.updatedTransactions.isEmpty) }
    @MainActor func testValidationFailsWithZeroAmount() async { let (vm,_,_) = makeViewModel(); await vm.loadData(); vm.amountText = "0"; XCTAssertFalse(await vm.save()); XCTAssertTrue(vm.showingValidationError) }
    @MainActor func testValidationFailsWithEmptyPayee() async { let (vm,_,_) = makeViewModel(); await vm.loadData(); vm.payee = "   "; XCTAssertFalse(await vm.save()); XCTAssertTrue(vm.showingValidationError) }
    @MainActor func testValidationFailsWithoutAccount() async { let (vm,_,_) = makeViewModel(); await vm.loadData(); vm.selectedAccountId = nil; XCTAssertFalse(await vm.save()); XCTAssertTrue(vm.showingValidationError) }
    @MainActor func testSaveSucceedsWithValidData() async { let (vm,r,_) = makeViewModel(); await vm.loadData(); vm.payee = "Updated Payee"; XCTAssertTrue(await vm.save()); XCTAssertEqual(r.updatedTransactions.count, 1); XCTAssertEqual(r.updatedTransactions.first?.id, SampleData.expenseTransaction.id); XCTAssertEqual(r.updatedTransactions.first?.payee, "Updated Payee") }
    @MainActor func testSavePreservesOriginalStatus() async { let (vm,r,_) = makeViewModel(transaction: SampleData.pendingTransaction); await vm.loadData(); vm.payee = "New"; XCTAssertTrue(await vm.save()); XCTAssertEqual(r.updatedTransactions.first?.status, .pending) }
    @MainActor func testSaveFailureCapturesError() async { let r = StubTransactionRepository(); r.errorToThrow = TestError.simulated; let (vm,_,_) = makeViewModel(transactionRepo: r); await vm.loadData(); vm.payee = "X"; XCTAssertFalse(await vm.save()); XCTAssertNotNil(vm.errorMessage); XCTAssertFalse(vm.isSaving) }
    @MainActor func testDeleteSucceeds() async { let (vm,r,_) = makeViewModel(); XCTAssertTrue(await vm.delete()); XCTAssertEqual(r.deletedTransactionIds.count, 1); XCTAssertEqual(r.deletedTransactionIds.first, SampleData.expenseTransaction.id) }
    @MainActor func testDeleteFailureCapturesError() async { let r = StubTransactionRepository(); r.errorToThrow = TestError.simulated; let (vm,_,_) = makeViewModel(transactionRepo: r); XCTAssertFalse(await vm.delete()); XCTAssertNotNil(vm.errorMessage); XCTAssertFalse(vm.isDeleting) }
    @MainActor func testIsProcessingReflectsState() { let (vm,_,_) = makeViewModel(); XCTAssertFalse(vm.isProcessing); vm.isSaving = true; XCTAssertTrue(vm.isProcessing); vm.isSaving = false; vm.isDeleting = true; XCTAssertTrue(vm.isProcessing) }
    @MainActor func testDismissErrorClearsState() { let (vm,_,_) = makeViewModel(); vm.errorMessage = "err"; XCTAssertTrue(vm.showError); vm.dismissError(); XCTAssertNil(vm.errorMessage); XCTAssertFalse(vm.showError) }
    @MainActor func testFormatAmountForEditing() { XCTAssertEqual(TransactionEditViewModel.formatAmountForEditing(2550), "25.50"); XCTAssertEqual(TransactionEditViewModel.formatAmountForEditing(100), "1.00"); XCTAssertEqual(TransactionEditViewModel.formatAmountForEditing(0), "0.00") }
}