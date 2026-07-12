// SPDX-License-Identifier: BUSL-1.1

// MockCategoryRepository.swift
// Finance
//
// In-memory mock implementation of CategoryRepository.
// TODO: Replace MockCategoryRepository with KMP-backed repository
// that reads from SQLDelight via the Swift Export bridge.

import Foundation

/// Returns hardcoded sample categories for development and SwiftUI previews.
struct MockCategoryRepository: CategoryRepository {

    func getCategories() async throws -> [CategoryItem] {
        [
            CategoryItem(id: "c1", name: "Groceries", colorHex: "#38A169", icon: "cart", sortOrder: 0),
            CategoryItem(id: "c2", name: "Dining Out", colorHex: "#DD6B20", icon: "fork.knife", sortOrder: 1),
            CategoryItem(id: "c3", name: "Transport", colorHex: "#3182CE", icon: "car", sortOrder: 2),
            CategoryItem(id: "c4", name: "Entertainment", colorHex: "#805AD5", icon: "film", sortOrder: 3),
            CategoryItem(id: "c5", name: "Shopping", colorHex: "#D53F8C", icon: "bag", sortOrder: 4),
            CategoryItem(id: "c6", name: "Utilities", colorHex: "#D69E2E", icon: "bolt", sortOrder: 5),
            CategoryItem(id: "c7", name: "Health", colorHex: "#E53E3E", icon: "heart", sortOrder: 6),
            CategoryItem(id: "c8", name: "Housing", colorHex: "#5A67D8", icon: "house", sortOrder: 7),
            // Kid-specific starter categories for single-parent / family setups (#2201).
            // Kids create frequent, irregular spending that broad defaults miss.
            CategoryItem(id: "kid-school", name: "School", colorHex: "#3182CE", icon: "graduationcap", sortOrder: 8),
            CategoryItem(id: "kid-childcare", name: "Childcare", colorHex: "#805AD5", icon: "figure.and.child.holdinghands", sortOrder: 9),
            CategoryItem(id: "kid-activities", name: "Activities & Sports", colorHex: "#38A169", icon: "figure.run", sortOrder: 10),
            CategoryItem(id: "kid-birthdays", name: "Birthdays & Parties", colorHex: "#D53F8C", icon: "gift", sortOrder: 11),
            CategoryItem(id: "kid-fieldtrips", name: "Field Trips", colorHex: "#DD6B20", icon: "bus", sortOrder: 12),
            CategoryItem(id: "kid-clothing", name: "Kids' Clothing", colorHex: "#00B5D8", icon: "tshirt", sortOrder: 13),
        ]
    }

    func getCategory(id: String) async throws -> CategoryItem? {
        try await getCategories().first { $0.id == id }
    }

    func createCategory(_ category: CategoryItem) async throws { }
    func updateCategory(_ category: CategoryItem) async throws { }
    func deleteCategory(id: String) async throws { }
}
