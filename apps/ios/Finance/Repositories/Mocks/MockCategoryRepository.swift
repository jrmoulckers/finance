// SPDX-License-Identifier: BUSL-1.1
import Foundation
final class MockCategoryRepository: CategoryRepository, @unchecked Sendable {
    private var categories: [CategoryItem]
    init() {
        let now = Date()
        categories = [
            CategoryItem(id: "cat-food", name: "Food & Groceries", colorHex: "#4CAF50", iconName: "cart", sortOrder: 0, isDefault: true, createdAt: now, updatedAt: now),
            CategoryItem(id: "cat-transport", name: "Transport", colorHex: "#2196F3", iconName: "car", sortOrder: 1, isDefault: true, createdAt: now, updatedAt: now),
            CategoryItem(id: "cat-entertainment", name: "Entertainment", colorHex: "#9C27B0", iconName: "film", sortOrder: 2, isDefault: true, createdAt: now, updatedAt: now),
            CategoryItem(id: "cat-shopping", name: "Shopping", colorHex: "#FF9800", iconName: "bag", sortOrder: 3, isDefault: true, createdAt: now, updatedAt: now),
            CategoryItem(id: "cat-bills", name: "Bills & Utilities", colorHex: "#F44336", iconName: "bolt", sortOrder: 4, isDefault: true, createdAt: now, updatedAt: now),
            CategoryItem(id: "cat-health", name: "Health", colorHex: "#E91E63", iconName: "heart", sortOrder: 5, isDefault: true, createdAt: now, updatedAt: now),
            CategoryItem(id: "cat-education", name: "Education", colorHex: "#00BCD4", iconName: "book", sortOrder: 6, isDefault: true, createdAt: now, updatedAt: now),
            CategoryItem(id: "cat-other", name: "Other", colorHex: "#607D8B", iconName: "ellipsis.circle", sortOrder: 7, isDefault: true, createdAt: now, updatedAt: now),
        ]
    }
    func getAll() async throws -> [CategoryItem] { categories.sorted { $0.sortOrder < $1.sortOrder } }
    func getById(_ id: String) async throws -> CategoryItem? { categories.first { $0.id == id } }
    func create(_ input: CreateCategoryInput) async throws -> CategoryItem {
        let now = Date()
        let item = CategoryItem(id: UUID().uuidString, name: input.name, colorHex: input.colorHex, iconName: input.iconName, sortOrder: input.sortOrder, isDefault: false, createdAt: now, updatedAt: now)
        categories.append(item); return item
    }
    func update(_ id: String, _ input: UpdateCategoryInput) async throws -> CategoryItem {
        guard let index = categories.firstIndex(where: { $0.id == id }) else { throw CategoryRepositoryError.notFound }
        let existing = categories[index]
        let updated = CategoryItem(id: existing.id, name: input.name ?? existing.name, colorHex: input.colorHex ?? existing.colorHex, iconName: input.iconName ?? existing.iconName, sortOrder: input.sortOrder ?? existing.sortOrder, isDefault: existing.isDefault, createdAt: existing.createdAt, updatedAt: Date())
        categories[index] = updated; return updated
    }
    @discardableResult func delete(_ id: String, reassignTo: String?) async throws -> Bool {
        guard let index = categories.firstIndex(where: { $0.id == id }) else { return false }
        categories.remove(at: index); return true
    }
    func reorder(_ ids: [String]) async throws {
        for (newOrder, id) in ids.enumerated() {
            if let index = categories.firstIndex(where: { $0.id == id }) {
                let existing = categories[index]
                categories[index] = CategoryItem(id: existing.id, name: existing.name, colorHex: existing.colorHex, iconName: existing.iconName, sortOrder: newOrder, isDefault: existing.isDefault, createdAt: existing.createdAt, updatedAt: Date())
            }
        }
    }
}
enum CategoryRepositoryError: Error, LocalizedError {
    case notFound
    var errorDescription: String? { switch self { case .notFound: String(localized: "Category not found.") } }
}