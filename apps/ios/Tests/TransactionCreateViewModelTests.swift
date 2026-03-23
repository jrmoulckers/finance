// SPDX-License-Identifier: BUSL-1.1

// TransactionCreateViewModelTests.swift
// FinanceTests
//
// Tests for TransactionCreateViewModel — data loading, step navigation,
// validation, and save flow.

import XCTest
@testable import FinanceApp

final class TransactionCreateViewModelTests: XCTestCase {

    // MARK: - Helpers

    @MainActor
    private func makeViewModel() -> (
        vm: TransactionCreateViewModel,
        transactionRepo: StubTransactionRepository,
        accountRepo: StubAccountRepository
    ) {
        let transactionRepo = StubTransactionRepository()
        let accountRepo = StubAccountRepository()
        accountRepo.accountsToReturn = SampleData.allAccounts
        let vm = TransactionCreateViewModel(
            transactionRepository: transactionRepo,
            accountRepository: accountRepo
        )
        return (vm, transactionRepo, accountRepo)
    }

    // MARK: - Test: loadData populates account picker options

    @MainActor
    func testLoadDataPopulatesAccounts() async {
        let (vm, _, _) = makeViewModel()

        await vm.loadData()

        XCTAssertEqual(vm.accounts.count, SampleData.allAccounts.count,
                       "Should have a picker option for every account")
        XCTAssertEqual(vm.accounts.first?.name, "Main Checking",
                       "First picker option should match the first account name")
    }

    // MARK: - Test: canAdvance validates details step requirements

    @MainActor
    func testCanAdvanceRequiresDetailsFields() async {
        let (vm, _, _) = makeViewModel()

        vm.currentStep = .details
        XCTAssertFalse(vm.canAdvance,
                       "Should not advance on details step without amount, payee, and account")

        vm.amountText = "50.00"
        vm.payee = "Test Payee"
        vm.selectedAccountId = "a1"
        XCTAssertTrue(vm.canAdvance,
                      "Should advance when all details fields are populated")
    }

    // MARK: - Test: step navigation advances and goes back

    @MainActor
    func testStepNavigation() async {
        let (vm, _, _) = makeViewModel()

        XCTAssertEqual(vm.currentStep, .type, "Initial step should be .type")

        vm.advance()
        XCTAssertEqual(vm.currentStep, .details, "Should advance to .details")

        vm.advance()
        XCTAssertEqual(vm.currentStep, .review, "Should advance to .review")

        // Advancing past the last step should be a no-op
        vm.advance()
        XCTAssertEqual(vm.currentStep, .review, "Should stay at .review when at last step")

        vm.goBack()
        XCTAssertEqual(vm.currentStep, .details, "Should go back to .details")

        vm.goBack()
        XCTAssertEqual(vm.currentStep, .type, "Should go back to .type")

        // Going back past the first step should be a no-op
        vm.goBack()
        XCTAssertEqual(vm.currentStep, .type, "Should stay at .type when at first step")
    }

    // MARK: - Test: save fails validation without required fields

    @MainActor
    func testSaveFailsWithoutRequiredFields() async {
        let (vm, transactionRepo, _) = makeViewModel()

        let result = await vm.save()

        XCTAssertFalse(result, "Save should return false when validation fails")
        XCTAssertTrue(vm.showingValidationError, "Should show validation error")
        XCTAssertFalse(vm.validationMessage.isEmpty, "Validation message should describe the issue")
        XCTAssertTrue(transactionRepo.createdTransactions.isEmpty,
                      "Repository should not be called when validation fails")
    }

    // MARK: - Test: successful save creates transaction in repository

    @MainActor
    func testSaveSucceedsWithValidData() async {
        let (vm, transactionRepo, _) = makeViewModel()

        await vm.loadData()

        vm.amountText = "25.50"
        vm.payee = "Coffee Shop"
        vm.selectedAccountId = "a1"
        vm.selectedCategoryId = "c1"
        vm.transactionType = .expense

        let result = await vm.save()

        XCTAssertTrue(result, "Save should succeed with valid data")
        XCTAssertEqual(transactionRepo.createdTransactions.count, 1,
                       "Repository should have one created transaction")

        let created = transactionRepo.createdTransactions.first
        XCTAssertEqual(created?.payee, "Coffee Shop")
        XCTAssertEqual(created?.type, .expense)
        XCTAssertEqual(created?.status, .pending,
                       "New transactions should have pending status")
    }

    // MARK: - Test: edit mode pre-fills fields

    @MainActor
    func testEditModePreFillsFields() async {
        let transactionRepo = StubTransactionRepository()
        let accountRepo = StubAccountRepository()
        accountRepo.accountsToReturn = SampleData.allAccounts
        let transaction = SampleData.expenseTransaction
        let vm = TransactionCreateViewModel(
            transactionRepository: transactionRepo,
            accountRepository: accountRepo,
            transaction: transaction
        )

        await vm.loadData()

        XCTAssertTrue(vm.isEditing, "Should be in edit mode")
        XCTAssertEqual(vm.payee, "Whole Foods",
                       "Payee should be pre-filled")
        XCTAssertEqual(vm.transactionType, .expense,
                       "Transaction type should be pre-filled")
        XCTAssertEqual(vm.navigationTitle, "Edit Transaction",
                       "Title should reflect edit mode")
        XCTAssertEqual(vm.saveButtonTitle, "Update Transaction",
                       "Save button should say Update in edit mode")
        XCTAssertNotNil(vm.selectedAccountId,
                        "Account should be resolved after loadData")
        XCTAssertNotNil(vm.selectedCategoryId,
                        "Category should be resolved after loadData")
    }

    // MARK: - Test: edit mode calls updateTransaction

    @MainActor
    func testEditModeSavesAsUpdate() async {
        let transactionRepo = StubTransactionRepository()
        let accountRepo = StubAccountRepository()
        accountRepo.accountsToReturn = SampleData.allAccounts
        let transaction = SampleData.expenseTransaction
        let vm = TransactionCreateViewModel(
            transactionRepository: transactionRepo,
            accountRepository: accountRepo,
            transaction: transaction
        )

        await vm.loadData()
        vm.payee = "Updated Payee"

        let result = await vm.save()

        XCTAssertTrue(result, "Update should succeed")
        XCTAssertEqual(transactionRepo.updatedTransactions.count, 1,
                       "Repository should have one updated transaction")
        XCTAssertTrue(transactionRepo.createdTransactions.isEmpty,
                      "Should not create when updating")
        XCTAssertEqual(transactionRepo.updatedTransactions.first?.id, transaction.id,
                       "Updated transaction should retain the original ID")
        XCTAssertEqual(transactionRepo.updatedTransactions.first?.payee, "Updated Payee",
                       "Updated transaction should have the new payee")
        XCTAssertEqual(transactionRepo.updatedTransactions.first?.status, .cleared,
                       "Updated transaction should preserve original status")
    }

    // MARK: - Test: create mode defaults

    @MainActor
    func testCreateModeDefaults() {
        let (vm, _, _) = makeViewModel()

        XCTAssertFalse(vm.isEditing, "Should not be in edit mode")
        XCTAssertEqual(vm.navigationTitle, "New Transaction",
                       "Title should reflect create mode")
        XCTAssertEqual(vm.saveButtonTitle, "Save Transaction",
                       "Save button should say Save Transaction in create mode")
    }
}
