// SPDX-License-Identifier: BUSL-1.1

// BudgetCreateViewModelTests.swift
// FinanceTests
//
// Tests for BudgetCreateViewModel — validation, create, edit, and error handling.

import XCTest
@testable import FinanceApp

final class BudgetCreateViewModelTests: XCTestCase {

    // MARK: - Test: validation fails without category

    @MainActor
    func testSaveFailsWithoutCategory() async {
        let repo = StubBudgetRepository()
        let vm = BudgetCreateViewModel(repository: repo)

        vm.amountText = "500.00"

        let result = await vm.save()

        XCTAssertFalse(result, "Save should fail when no category is selected")
        XCTAssertTrue(vm.showingValidationError, "Should show validation error")
        XCTAssertTrue(vm.validationMessage.contains("category"),
                      "Validation message should mention category")
        XCTAssertTrue(repo.createdBudgets.isEmpty,
                      "Repository should not be called when validation fails")
    }

    // MARK: - Test: validation fails without valid amount

    @MainActor
    func testSaveFailsWithZeroAmount() async {
        let repo = StubBudgetRepository()
        let vm = BudgetCreateViewModel(repository: repo)

        vm.selectedCategoryId = "c1"
        vm.amountText = "0"

        let result = await vm.save()

        XCTAssertFalse(result, "Save should fail when amount is zero")
        XCTAssertTrue(vm.showingValidationError, "Should show validation error")
    }

    @MainActor
    func testSaveFailsWithEmptyAmount() async {
        let repo = StubBudgetRepository()
        let vm = BudgetCreateViewModel(repository: repo)

        vm.selectedCategoryId = "c1"
        vm.amountText = ""

        let result = await vm.save()

        XCTAssertFalse(result, "Save should fail when amount is empty")
        XCTAssertTrue(vm.showingValidationError, "Should show validation error")
    }

    // MARK: - Test: successful create

    @MainActor
    func testSaveSucceedsWithValidData() async {
        let repo = StubBudgetRepository()
        let vm = BudgetCreateViewModel(repository: repo)

        vm.selectedCategoryId = "c1"
        vm.amountText = "500.00"
        vm.selectedPeriod = .monthly

        let result = await vm.save()

        XCTAssertTrue(result, "Save should succeed with valid data")
        XCTAssertEqual(repo.createdBudgets.count, 1,
                       "Repository should have one created budget")

        let created = repo.createdBudgets.first
        XCTAssertEqual(created?.categoryName, "Groceries",
                       "Budget category name should match selected category")
        XCTAssertEqual(created?.limitMinorUnits, 500_00,
                       "Budget limit should be 500.00 in minor units")
        XCTAssertEqual(created?.period, "Monthly",
                       "Budget period should be Monthly")
        XCTAssertTrue(vm.didSave, "didSave should be true after successful save")
    }

    // MARK: - Test: edit mode pre-fills fields

    @MainActor
    func testEditModePreFillsFields() async {
        let repo = StubBudgetRepository()
        let budget = SampleData.groceriesBudget
        let vm = BudgetCreateViewModel(repository: repo, budget: budget)

        XCTAssertTrue(vm.isEditing, "Should be in edit mode")
        XCTAssertNotNil(vm.selectedCategoryId,
                        "Category should be pre-selected")
        XCTAssertEqual(vm.amountText, "500.00",
                       "Amount should be pre-filled from budget limit")
        XCTAssertEqual(vm.navigationTitle, "Edit Budget",
                       "Title should reflect edit mode")
        XCTAssertEqual(vm.saveButtonTitle, "Update",
                       "Save button should say Update in edit mode")
    }

    // MARK: - Test: edit mode calls updateBudget

    @MainActor
    func testEditModeSavesAsUpdate() async {
        let repo = StubBudgetRepository()
        let budget = SampleData.groceriesBudget
        let vm = BudgetCreateViewModel(repository: repo, budget: budget)

        vm.amountText = "600.00"

        let result = await vm.save()

        XCTAssertTrue(result, "Update should succeed")
        XCTAssertEqual(repo.updatedBudgets.count, 1,
                       "Repository should have one updated budget")
        XCTAssertTrue(repo.createdBudgets.isEmpty,
                      "Should not create when updating")
        XCTAssertEqual(repo.updatedBudgets.first?.limitMinorUnits, 600_00,
                       "Updated budget should have the new limit")
        XCTAssertEqual(repo.updatedBudgets.first?.id, budget.id,
                       "Updated budget should retain the original ID")
    }

    // MARK: - Test: repository error shows alert

    @MainActor
    func testSaveHandlesRepositoryError() async {
        let repo = StubBudgetRepository()
        repo.errorToThrow = TestError.simulated
        let vm = BudgetCreateViewModel(repository: repo)

        vm.selectedCategoryId = "c1"
        vm.amountText = "500.00"

        let result = await vm.save()

        XCTAssertFalse(result, "Save should fail when repository throws")
        XCTAssertTrue(vm.showingValidationError, "Should show error alert")
        XCTAssertFalse(vm.didSave, "didSave should remain false on error")
    }

    // MARK: - Test: create mode defaults

    @MainActor
    func testCreateModeDefaults() {
        let repo = StubBudgetRepository()
        let vm = BudgetCreateViewModel(repository: repo)

        XCTAssertFalse(vm.isEditing, "Should not be in edit mode")
        XCTAssertNil(vm.selectedCategoryId, "No category should be selected")
        XCTAssertEqual(vm.amountText, "", "Amount should be empty")
        XCTAssertEqual(vm.selectedPeriod, .monthly, "Default period should be monthly")
        XCTAssertEqual(vm.navigationTitle, "Create Budget",
                       "Title should reflect create mode")
        XCTAssertEqual(vm.saveButtonTitle, "Save",
                       "Save button should say Save in create mode")
    }
}
