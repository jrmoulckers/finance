// SPDX-License-Identifier: BUSL-1.1

// CategoryRepository.swift
// Finance
//
// Protocol defining the data-access contract for categories.
// Swap the concrete implementation to move from mock data to a
// KMP-backed repository without changing any ViewModel or View code.

import Foundation

/// Data-access contract for transaction categories.
///
/// All methods are `async throws` so implementations can perform
/// network, database, or KMP bridge calls transparently.
protocol CategoryRepository: Sendable {

    /// Returns all categories ordered by sort order.
    func getCategories() async throws -> [CategoryItem]

    /// Returns a single category by its identifier, or `nil` if not found.
    func getCategory(id: String) async throws -> CategoryItem?

    /// Persists a new category.
    func createCategory(_ category: CategoryItem) async throws

    /// Updates an existing category.
    func updateCategory(_ category: CategoryItem) async throws

    /// Permanently deletes the category with the given identifier.
    func deleteCategory(id: String) async throws
}
