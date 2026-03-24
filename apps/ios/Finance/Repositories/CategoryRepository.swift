// SPDX-License-Identifier: BUSL-1.1
import Foundation
protocol CategoryRepository: Sendable {
    func getAll() async throws -> [CategoryItem]
    func getById(_ id: String) async throws -> CategoryItem?
    func create(_ input: CreateCategoryInput) async throws -> CategoryItem
    func update(_ id: String, _ input: UpdateCategoryInput) async throws -> CategoryItem
    @discardableResult
    func delete(_ id: String, reassignTo: String?) async throws -> Bool
    func reorder(_ ids: [String]) async throws
}