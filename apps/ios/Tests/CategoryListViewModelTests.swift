// SPDX-License-Identifier: BUSL-1.1

// CategoryListViewModelTests.swift
// FinanceTests
//
// Tests for CategoryListViewModel — loading, create, update, delete,
// and error handling.

import XCTest
@testable import FinanceApp

final class CategoryListViewModelTests: XCTestCase {

    // MARK: - Test: loadCategories populates list

    @MainActor
    func testLoadCategoriesPopulatesList() async {
        let repo = StubCategoryRepository()
        repo.categoriesToReturn = SampleData.allCategories
        let vm = CategoryListViewModel(repository: repo)

        await vm.loadCategories()

        XCTAssertEqual(vm.categories.count, SampleData.allCategories.count,
                       "Should load all categories from the repository")
        XCTAssertFalse(vm.isLoading, "isLoading should be false after loading")
    }

    // MARK: - Test: error clears categories

    @MainActor
    func testErrorHandlingClearsCategories() async {
        let repo = StubCategoryRepository()
        repo.errorToThrow = TestError.simulated
        let vm = CategoryListViewModel(repository: repo)

        await vm.loadCategories()

        XCTAssertTrue(vm.categories.isEmpty,
                      "Categories should be empty when repository throws")
        XCTAssertFalse(vm.isLoading, "isLoading should be false after error")
        XCTAssertNotNil(vm.errorMessage, "Error message should be set")
    }

    // MARK: - Test: create category succeeds

    @MainActor
    func testCreateCategorySucceeds() async {
        let repo = StubCategoryRepository()
        let vm = CategoryListViewModel(repository: repo)

        let result = await vm.createCategory(
            name: "Travel",
            colorHex: "#3182CE",
            icon: "airplane"
        )

        XCTAssertTrue(result, "Create should succeed with valid data")
        XCTAssertEqual(repo.createdCategories.count, 1,
                       "Repository should have one created category")
        XCTAssertEqual(repo.createdCategories.first?.name, "Travel",
                       "Created category name should match")
        XCTAssertEqual(vm.categories.count, 1,
                       "ViewModel should have one category after creation")
    }

    // MARK: - Test: create fails with empty name

    @MainActor
    func testCreateCategoryFailsWithEmptyName() async {
        let repo = StubCategoryRepository()
        let vm = CategoryListViewModel(repository: repo)

        let result = await vm.createCategory(
            name: "   ",
            colorHex: "#3182CE",
            icon: "airplane"
        )

        XCTAssertFalse(result, "Create should fail with empty name")
        XCTAssertNotNil(vm.errorMessage, "Error message should be set")
        XCTAssertTrue(repo.createdCategories.isEmpty,
                      "Repository should not be called when validation fails")
    }

    // MARK: - Test: update category succeeds

    @MainActor
    func testUpdateCategorySucceeds() async {
        let repo = StubCategoryRepository()
        let existing = SampleData.groceriesCategory
        let vm = CategoryListViewModel(repository: repo)
        vm.categories = [existing]

        let result = await vm.updateCategory(
            id: existing.id,
            name: "Food & Groceries",
            colorHex: "#38A169",
            icon: "cart"
        )

        XCTAssertTrue(result, "Update should succeed with valid data")
        XCTAssertEqual(repo.updatedCategories.count, 1,
                       "Repository should have one updated category")
        XCTAssertEqual(vm.categories.first?.name, "Food & Groceries",
                       "Category name should be updated in local state")
    }

    // MARK: - Test: update fails for unknown category

    @MainActor
    func testUpdateCategoryFailsForUnknownId() async {
        let repo = StubCategoryRepository()
        let vm = CategoryListViewModel(repository: repo)

        let result = await vm.updateCategory(
            id: "unknown-id",
            name: "Test",
            colorHex: "#3182CE",
            icon: "cart"
        )

        XCTAssertFalse(result, "Update should fail for unknown category ID")
        XCTAssertNotNil(vm.errorMessage, "Error message should be set")
    }

    // MARK: - Test: delete category

    @MainActor
    func testDeleteCategoryRemovesFromList() async {
        let repo = StubCategoryRepository()
        let existing = SampleData.groceriesCategory
        let vm = CategoryListViewModel(repository: repo)
        vm.categories = [existing]
        vm.categoryToDelete = existing

        await vm.deleteCategory()

        XCTAssertTrue(vm.categories.isEmpty,
                      "Category should be removed from local state")
        XCTAssertEqual(repo.deletedCategoryIds.count, 1,
                       "Repository should have one deleted category")
        XCTAssertEqual(repo.deletedCategoryIds.first, existing.id,
                       "Deleted ID should match")
        XCTAssertFalse(vm.showingDeleteConfirmation,
                       "Delete confirmation should be dismissed")
    }

    // MARK: - Test: delete handles repository error

    @MainActor
    func testDeleteCategoryHandlesError() async {
        let repo = StubCategoryRepository()
        repo.errorToThrow = TestError.simulated
        let existing = SampleData.groceriesCategory
        let vm = CategoryListViewModel(repository: repo)
        vm.categories = [existing]
        vm.categoryToDelete = existing

        await vm.deleteCategory()

        XCTAssertNotNil(vm.errorMessage, "Error message should be set on failure")
    }

    // MARK: - Test: confirmDelete sets state

    @MainActor
    func testConfirmDeleteSetsState() {
        let repo = StubCategoryRepository()
        let vm = CategoryListViewModel(repository: repo)
        let category = SampleData.groceriesCategory

        vm.confirmDelete(category)

        XCTAssertEqual(vm.categoryToDelete?.id, category.id,
                       "categoryToDelete should be set")
        XCTAssertTrue(vm.showingDeleteConfirmation,
                      "showingDeleteConfirmation should be true")
    }

    // MARK: - Test: cancelDelete resets state

    @MainActor
    func testCancelDeleteResetsState() {
        let repo = StubCategoryRepository()
        let vm = CategoryListViewModel(repository: repo)

        vm.categoryToDelete = SampleData.groceriesCategory
        vm.showingDeleteConfirmation = true

        vm.cancelDelete()

        XCTAssertNil(vm.categoryToDelete, "categoryToDelete should be nil")
        XCTAssertFalse(vm.showingDeleteConfirmation,
                       "showingDeleteConfirmation should be false")
    }

    // MARK: - Test: dismissError clears message

    @MainActor
    func testDismissErrorClearsMessage() {
        let repo = StubCategoryRepository()
        let vm = CategoryListViewModel(repository: repo)

        vm.errorMessage = "Test error"
        XCTAssertTrue(vm.showError)

        vm.dismissError()

        XCTAssertNil(vm.errorMessage)
        XCTAssertFalse(vm.showError)
    }
}
