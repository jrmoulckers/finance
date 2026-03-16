// SPDX-License-Identifier: BUSL-1.1

// TransactionEditViewModelTests.swift
// FinanceTests
//
// Tests for TransactionEditViewModel — pre-population, change detection,
// validation, save flow, and cancel behaviour.

import XCTest
@testable import FinanceApp

final class TransactionEditViewModelTests: XCTestCase {

    // MARK: - Helpers

    @MainActor
    private func makeViewModel(
        transaction: TransactionItem = SampleData.expenseTransaction
    ) -> (
        vm: TransactionEditViewModel,
        transactionRepo: StubTransactionRepository,
        accountRepo: StubAccountRepository
    ) {
        let transactionRepo = StubTransactionRepository()
        let accountRepo = StubAccountRepository()
        accountRepo.accountsToReturn = SampleData.allAccounts
        let vm = TransactionEditViewModel(
            transaction: transaction,
            repository: transactionRepo,
            accountRepository: accountRepo
        )
        return (vm, transactionRepo, accountRepo)
    }

    // MARK: - Test: Pre-population from existing transaction

    @MainActor
    func testInitPrePopulatesFieldsFromTransaction() async {
        let transaction = TransactionItem(
            id: "t-edit-1", payee: "Trader Joe's",
            category: "Groceries", accountName: "Main Checking",
            amountMinorUnits: -42_50, currencyCode: "USD",
            date: Date(timeIntervalSince1970: 1_700_000_000),
            type: .expense, status: .cleared, note: "Weekly groceries"
        )
        let (vm, _, _) = makeViewModel(transaction: transaction)

        XCTAssertEqual(vm.transactionType, .expense,
                       "Transaction type should be pre-populated from original")
        XCTAssertEqual(vm.amountText, "42.50",
                       "Amount text should format absolute minor units to decimal string")
        XCTAssertEqual(vm.payee, "Trader Joe's",
                       "Payee should be pre-populated from original")
        XCTAssertEqual(vm.note, "Weekly groceries",
                       "Note should be pre-populated from original")
        XCTAssertEqual(vm.currencyCode, "USD",
                       "Currency code should be pre-populated from original")
        XCTAssertTrue(Calendar.current.isDate(vm.date, equalTo: transaction.date, toGranularity: .second),
                      "Date should be pre-populated from original")
    }

    @MainActor
    func testInitPrePopulatesNilNoteAsEmptyString() async {
        let transaction = TransactionItem(
            id: "t-edit-2", payee: "Netflix",
            category: "Entertainment", accountName: "Travel Card",
            amountMinorUnits: -15_99, currencyCode: "USD",
            date: .now, type: .expense, status: .cleared
        )
        let (vm, _, _) = makeViewModel(transaction: transaction)

        XCTAssertEqual(vm.note, "",
                       "Nil note on transaction should be pre-populated as empty string")
    }

    @MainActor
    func testLoadDataResolvesAccountAndCategoryIds() async {
        let (vm, _, _) = makeViewModel(transaction: SampleData.expenseTransaction)

        await vm.loadData()

        XCTAssertEqual(vm.accounts.count, SampleData.allAccounts.count,
                       "Should load all accounts for the picker")
        XCTAssertNotNil(vm.selectedAccountId,
                        "Should resolve account ID from transaction's account name")
        XCTAssertEqual(vm.selectedAccountId, "a1",
                       "Main Checking should resolve to account ID a1")
    }

    // MARK: - Test: hasChanges detection

    @MainActor
    func testHasChangesReturnsFalseWhenUnmodified() async {
        let (vm, _, _) = makeViewModel()

        await vm.loadData()

        XCTAssertFalse(vm.hasChanges,
                       "hasChanges should be false when no fields have been modified")
    }

    @MainActor
    func testHasChangesDetectsPayeeChange() async {
        let (vm, _, _) = makeViewModel()

        await vm.loadData()
        vm.payee = "New Payee Name"

        XCTAssertTrue(vm.hasChanges,
                      "hasChanges should be true after modifying the payee")
    }

    @MainActor
    func testHasChangesDetectsAmountChange() async {
        let (vm, _, _) = makeViewModel()

        await vm.loadData()
        vm.amountText = "999.99"

        XCTAssertTrue(vm.hasChanges,
                      "hasChanges should be true after modifying the amount")
    }

    @MainActor
    func testHasChangesDetectsTypeChange() async {
        let (vm, _, _) = makeViewModel()

        await vm.loadData()
        vm.transactionType = .income

        XCTAssertTrue(vm.hasChanges,
                      "hasChanges should be true after modifying the transaction type")
    }

    @MainActor
    func testHasChangesDetectsNoteChange() async {
        let (vm, _, _) = makeViewModel()

        await vm.loadData()
        vm.note = "A new note"

        XCTAssertTrue(vm.hasChanges,
                      "hasChanges should be true after adding a note")
    }

    @MainActor
    func testHasChangesDetectsDateChange() async {
        let (vm, _, _) = makeViewModel()

        await vm.loadData()
        vm.date = Calendar.current.date(byAdding: .day, value: -7, to: vm.date)!

        XCTAssertTrue(vm.hasChanges,
                      "hasChanges should be true after modifying the date")
    }

    @MainActor
    func testHasChangesDetectsAccountChange() async {
        let (vm, _, _) = makeViewModel()

        await vm.loadData()
        vm.selectedAccountId = "a2"

        XCTAssertTrue(vm.hasChanges,
                      "hasChanges should be true after selecting a different account")
    }

    // MARK: - Test: Save calls updateTransaction on repository

    @MainActor
    func testSaveCallsUpdateTransactionOnRepository() async {
        let (vm, transactionRepo, _) = makeViewModel()

        await vm.loadData()
        vm.payee = "Updated Payee"

        let result = await vm.save()

        XCTAssertTrue(result, "Save should succeed with valid pre-populated data")
        XCTAssertEqual(transactionRepo.updatedTransactions.count, 1,
                       "Repository should have one updated transaction")
        XCTAssertEqual(transactionRepo.updatedTransactions.first?.payee, "Updated Payee",
                       "Updated transaction should reflect the new payee")
        XCTAssertEqual(transactionRepo.updatedTransactions.first?.id, SampleData.expenseTransaction.id,
                       "Updated transaction should preserve the original ID")
    }

    @MainActor
    func testSavePreservesOriginalIdAndStatus() async {
        let transaction = TransactionItem(
            id: "original-id-123", payee: "Test Payee",
            category: "Groceries", accountName: "Main Checking",
            amountMinorUnits: -50_00, currencyCode: "USD",
            date: .now, type: .expense, status: .pending
        )
        let (vm, transactionRepo, _) = makeViewModel(transaction: transaction)

        await vm.loadData()

        let result = await vm.save()

        XCTAssertTrue(result, "Save should succeed")
        let updated = transactionRepo.updatedTransactions.first
        XCTAssertEqual(updated?.id, "original-id-123",
                       "Updated transaction must preserve the original ID")
        XCTAssertEqual(updated?.status, .pending,
                       "Updated transaction must preserve the original status")
    }

    @MainActor
    func testSaveDoesNotCreateNewTransaction() async {
        let (vm, transactionRepo, _) = makeViewModel()

        await vm.loadData()

        _ = await vm.save()

        XCTAssertTrue(transactionRepo.createdTransactions.isEmpty,
                      "Edit save should call updateTransaction, not createTransaction")
    }

    @MainActor
    func testSaveIncludesNoteWhenProvided() async {
        let (vm, transactionRepo, _) = makeViewModel()

        await vm.loadData()
        vm.note = "Updated note text"

        _ = await vm.save()

        XCTAssertEqual(transactionRepo.updatedTransactions.first?.note, "Updated note text",
                       "Updated transaction should include the note")
    }

    @MainActor
    func testSaveOmitsNoteWhenEmpty() async {
        let (vm, transactionRepo, _) = makeViewModel()

        await vm.loadData()
        vm.note = ""

        _ = await vm.save()

        XCTAssertNil(transactionRepo.updatedTransactions.first?.note,
                     "Updated transaction should have nil note when note is empty")
    }

    @MainActor
    func testSaveHandlesRepositoryError() async {
        let (vm, transactionRepo, _) = makeViewModel()

        await vm.loadData()
        transactionRepo.errorToThrow = TestError.simulated

        let result = await vm.save()

        XCTAssertFalse(result, "Save should return false when repository throws")
        XCTAssertTrue(vm.showingValidationError, "Should show error to user")
        XCTAssertFalse(vm.validationMessage.isEmpty, "Error message should be populated")
    }

    // MARK: - Test: Validation (same rules as create)

    @MainActor
    func testSaveFailsWithEmptyAmount() async {
        let (vm, transactionRepo, _) = makeViewModel()

        await vm.loadData()
        vm.amountText = ""

        let result = await vm.save()

        XCTAssertFalse(result, "Save should fail with empty amount")
        XCTAssertTrue(vm.showingValidationError, "Should show validation error")
        XCTAssertTrue(transactionRepo.updatedTransactions.isEmpty,
                      "Repository should not be called when validation fails")
    }

    @MainActor
    func testSaveFailsWithZeroAmount() async {
        let (vm, transactionRepo, _) = makeViewModel()

        await vm.loadData()
        vm.amountText = "0.00"

        let result = await vm.save()

        XCTAssertFalse(result, "Save should fail with zero amount")
        XCTAssertTrue(vm.showingValidationError, "Should show validation error")
        XCTAssertTrue(transactionRepo.updatedTransactions.isEmpty,
                      "Repository should not be called when validation fails")
    }

    @MainActor
    func testSaveFailsWithEmptyPayee() async {
        let (vm, transactionRepo, _) = makeViewModel()

        await vm.loadData()
        vm.payee = ""

        let result = await vm.save()

        XCTAssertFalse(result, "Save should fail with empty payee")
        XCTAssertTrue(vm.showingValidationError, "Should show validation error")
        XCTAssertTrue(transactionRepo.updatedTransactions.isEmpty,
                      "Repository should not be called when validation fails")
    }

    @MainActor
    func testSaveFailsWithNoAccount() async {
        let (vm, transactionRepo, _) = makeViewModel()

        await vm.loadData()
        vm.selectedAccountId = nil

        let result = await vm.save()

        XCTAssertFalse(result, "Save should fail without a selected account")
        XCTAssertTrue(vm.showingValidationError, "Should show validation error")
        XCTAssertTrue(transactionRepo.updatedTransactions.isEmpty,
                      "Repository should not be called when validation fails")
    }

    // MARK: - Test: Cancel doesn't modify original

    @MainActor
    func testCancelDoesNotModifyOriginalTransaction() async {
        let original = SampleData.expenseTransaction
        let (vm, transactionRepo, _) = makeViewModel(transaction: original)

        await vm.loadData()

        // Modify every field
        vm.transactionType = .income
        vm.amountText = "9999.99"
        vm.payee = "Completely Different Payee"
        vm.selectedAccountId = "a2"
        vm.selectedCategoryId = "c4"
        vm.date = Date.distantPast
        vm.note = "Modified note"

        // Simulate cancel — don't call save

        XCTAssertEqual(vm.originalTransaction.id, original.id,
                       "Original transaction ID should be unchanged")
        XCTAssertEqual(vm.originalTransaction.payee, original.payee,
                       "Original transaction payee should be unchanged")
        XCTAssertEqual(vm.originalTransaction.amountMinorUnits, original.amountMinorUnits,
                       "Original transaction amount should be unchanged")
        XCTAssertEqual(vm.originalTransaction.type, original.type,
                       "Original transaction type should be unchanged")
        XCTAssertTrue(transactionRepo.updatedTransactions.isEmpty,
                      "No repository calls should be made on cancel")
    }

    // MARK: - Test: Step navigation

    @MainActor
    func testStepNavigation() async {
        let (vm, _, _) = makeViewModel()

        XCTAssertEqual(vm.currentStep, .type, "Initial step should be .type")

        vm.advance()
        XCTAssertEqual(vm.currentStep, .details, "Should advance to .details")

        vm.advance()
        XCTAssertEqual(vm.currentStep, .review, "Should advance to .review")

        vm.advance()
        XCTAssertEqual(vm.currentStep, .review, "Should stay at .review when at last step")

        vm.goBack()
        XCTAssertEqual(vm.currentStep, .details, "Should go back to .details")

        vm.goBack()
        XCTAssertEqual(vm.currentStep, .type, "Should go back to .type")

        vm.goBack()
        XCTAssertEqual(vm.currentStep, .type, "Should stay at .type when at first step")
    }

    // MARK: - Test: canAdvance

    @MainActor
    func testCanAdvanceOnTypeStepAlwaysTrue() async {
        let (vm, _, _) = makeViewModel()

        XCTAssertTrue(vm.canAdvance,
                      "Should always be able to advance from the type step")
    }

    @MainActor
    func testCanAdvanceRequiresDetailsFields() async {
        let (vm, _, _) = makeViewModel()

        vm.currentStep = .details
        vm.amountText = ""
        vm.payee = ""
        vm.selectedAccountId = nil

        XCTAssertFalse(vm.canAdvance,
                       "Should not advance on details step without amount, payee, and account")

        vm.amountText = "50.00"
        vm.payee = "Test Payee"
        vm.selectedAccountId = "a1"

        XCTAssertTrue(vm.canAdvance,
                      "Should advance when all details fields are populated")
    }

    // MARK: - Test: Income amount sign

    @MainActor
    func testSaveAppliesPositiveAmountForIncome() async {
        let transaction = TransactionItem(
            id: "t-income", payee: "Payroll",
            category: "Income", accountName: "Main Checking",
            amountMinorUnits: 4_250_00, currencyCode: "USD",
            date: .now, type: .income, status: .cleared
        )
        let (vm, transactionRepo, _) = makeViewModel(transaction: transaction)

        await vm.loadData()

        let result = await vm.save()

        XCTAssertTrue(result, "Save should succeed")
        let updated = transactionRepo.updatedTransactions.first
        XCTAssertNotNil(updated)
        XCTAssertGreaterThan(updated?.amountMinorUnits ?? 0, 0,
                             "Income transaction should have positive amount")
    }

    @MainActor
    func testSaveAppliesNegativeAmountForExpense() async {
        let (vm, transactionRepo, _) = makeViewModel()

        await vm.loadData()

        let result = await vm.save()

        XCTAssertTrue(result, "Save should succeed")
        let updated = transactionRepo.updatedTransactions.first
        XCTAssertNotNil(updated)
        XCTAssertLessThan(updated?.amountMinorUnits ?? 0, 0,
                          "Expense transaction should have negative amount")
    }
}
