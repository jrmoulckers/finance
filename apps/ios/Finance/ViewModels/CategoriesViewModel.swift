// SPDX-License-Identifier: BUSL-1.1
import Observation
import Foundation
import os

@Observable @MainActor
final class CategoriesViewModel {
    private let repository: CategoryRepository
    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.finance", category: "CategoriesViewModel")
    private var allCategories: [CategoryItem] = []
    var searchText = ""
    var categories: [CategoryItem] {
        if searchText.isEmpty { return allCategories }
        return allCategories.filter { $0.name.localizedCaseInsensitiveContains(searchText) }
    }
    var isLoading = false
    var errorMessage: String?
    var showError: Bool { errorMessage != nil }
    func dismissError() { errorMessage = nil }
    init(repository: CategoryRepository) { self.repository = repository }
    func loadCategories() async {
        isLoading = true; defer { isLoading = false }
        do { allCategories = try await repository.getAll() }
        catch { errorMessage = String(localized: "Failed to load categories. Please try again."); Self.logger.error("Categories load failed: \(error.localizedDescription, privacy: .public)"); allCategories = [] }
    }
    func createCategory(name: String, colorHex: String, iconName: String) async {
        let input = CreateCategoryInput(name: name, colorHex: colorHex, iconName: iconName, sortOrder: allCategories.count)
        do { let created = try await repository.create(input); allCategories.append(created); Self.logger.info("Category created: \(created.name, privacy: .public)") }
        catch { errorMessage = String(localized: "Failed to create category. Please try again."); Self.logger.error("Category creation failed: \(error.localizedDescription, privacy: .public)") }
    }
    func updateCategory(id: String, name: String, colorHex: String, iconName: String) async {
        let input = UpdateCategoryInput(name: name, colorHex: colorHex, iconName: iconName, sortOrder: nil)
        do { let updated = try await repository.update(id, input); if let index = allCategories.firstIndex(where: { $0.id == id }) { allCategories[index] = updated }; Self.logger.info("Category updated: \(updated.name, privacy: .public)") }
        catch { errorMessage = String(localized: "Failed to update category. Please try again."); Self.logger.error("Category update failed: \(error.localizedDescription, privacy: .public)") }
    }
    func deleteCategory(id: String, reassignTo: String? = nil) async {
        do { try await repository.delete(id, reassignTo: reassignTo); allCategories.removeAll { $0.id == id }; Self.logger.info("Category deleted: \(id, privacy: .public)") }
        catch { errorMessage = String(localized: "Failed to delete category. Please try again."); Self.logger.error("Category deletion failed: \(error.localizedDescription, privacy: .public)") }
    }
    func reorderCategories(fromOffsets source: IndexSet, toOffset destination: Int) {
        allCategories.move(fromOffsets: source, toOffset: destination)
        let ids = allCategories.map(\.id)
        Task { do { try await repository.reorder(ids) } catch { errorMessage = String(localized: "Failed to reorder categories. Please try again."); await loadCategories() } }
    }
}