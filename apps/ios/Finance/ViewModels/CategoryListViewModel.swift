// SPDX-License-Identifier: BUSL-1.1

// CategoryListViewModel.swift
// Finance
//
// ViewModel for the category management screen. Handles loading,
// creating, updating, and deleting categories via CategoryRepository.

import Observation
import Foundation
import os

@Observable
final class CategoryListViewModel {
    private let repository: CategoryRepository

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "CategoryListViewModel"
    )

    var categories: [CategoryItem] = []
    var isLoading = false
    var showingCreateForm = false
    var editingCategory: CategoryItem?
    var categoryToDelete: CategoryItem?
    var showingDeleteConfirmation = false
    var errorMessage: String?

    /// Whether an error alert should be presented.
    var showError: Bool { errorMessage != nil }

    /// Clears the current error message, dismissing the alert.
    func dismissError() { errorMessage = nil }

    init(repository: CategoryRepository) {
        self.repository = repository
    }

    // MARK: - Load

    func loadCategories() async {
        isLoading = true
        defer { isLoading = false }

        do {
            categories = try await repository.getCategories()
            Self.logger.info("Loaded \(self.categories.count, privacy: .public) categories")
        } catch {
            errorMessage = String(localized: "Failed to load categories. Please try again.")
            Self.logger.error("Categories load failed: \(error.localizedDescription, privacy: .public)")
            categories = []
        }
    }

    // MARK: - Create

    func createCategory(name: String, colorHex: String, icon: String) async -> Bool {
        guard validateName(name) else { return false }

        let category = CategoryItem(
            name: name,
            colorHex: colorHex,
            icon: icon,
            sortOrder: categories.count
        )

        do {
            try await repository.createCategory(category)
            categories.append(category)
            Self.logger.info("Category created: \(category.id, privacy: .private)")
            return true
        } catch {
            errorMessage = String(localized: "Failed to create category. Please try again.")
            Self.logger.error("Category creation failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    // MARK: - Update

    func updateCategory(id: String, name: String, colorHex: String, icon: String) async -> Bool {
        guard validateName(name) else { return false }

        guard let existing = categories.first(where: { $0.id == id }) else {
            errorMessage = String(localized: "Category not found.")
            return false
        }

        let updated = CategoryItem(
            id: existing.id,
            name: name,
            colorHex: colorHex,
            icon: icon,
            sortOrder: existing.sortOrder
        )

        do {
            try await repository.updateCategory(updated)
            if let index = categories.firstIndex(where: { $0.id == id }) {
                categories[index] = updated
            }
            Self.logger.info("Category updated: \(updated.id, privacy: .private)")
            return true
        } catch {
            errorMessage = String(localized: "Failed to update category. Please try again.")
            Self.logger.error("Category update failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    // MARK: - Delete

    func confirmDelete(_ category: CategoryItem) {
        categoryToDelete = category
        showingDeleteConfirmation = true
    }

    func deleteCategory() async {
        guard let category = categoryToDelete else { return }

        do {
            try await repository.deleteCategory(id: category.id)
            categories.removeAll { $0.id == category.id }
            Self.logger.info("Category deleted: \(category.id, privacy: .private)")
        } catch {
            errorMessage = String(localized: "Failed to delete category. Please try again.")
            Self.logger.error("Category deletion failed: \(error.localizedDescription, privacy: .public)")
        }

        categoryToDelete = nil
        showingDeleteConfirmation = false
    }

    func cancelDelete() {
        categoryToDelete = nil
        showingDeleteConfirmation = false
    }

    // MARK: - Validation

    private func validateName(_ name: String) -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            errorMessage = String(localized: "Category name cannot be empty.")
            return false
        }
        return true
    }
}
