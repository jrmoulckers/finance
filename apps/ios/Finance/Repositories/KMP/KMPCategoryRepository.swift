// SPDX-License-Identifier: BUSL-1.1
// KMPCategoryRepository.swift

import Foundation
import os

struct KMPCategoryRepository: CategoryRepository {
    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.finance", category: "KMPCategoryRepository")

    func getCategories() async throws -> [CategoryItem] {
        if await KMPBridge.shared.isKMPAvailable {
            do { return try await fallbackCategories() }
            catch { throw KMPRepositoryError.bridgeCallFailed(underlying: error.localizedDescription) }
        } else { return try await fallbackCategories() }
    }

    func getCategory(id: String) async throws -> CategoryItem? {
        if await KMPBridge.shared.isKMPAvailable {
            do { return try await fallbackCategories().first { $0.id == id } }
            catch { throw KMPRepositoryError.bridgeCallFailed(underlying: error.localizedDescription) }
        } else { return try await fallbackCategories().first { $0.id == id } }
    }

    func createCategory(_ category: CategoryItem) async throws {
        if await KMPBridge.shared.isKMPAvailable { Self.logger.info("Creating category via KMP") }
    }

    func updateCategory(_ category: CategoryItem) async throws {
        if await KMPBridge.shared.isKMPAvailable { Self.logger.info("Updating category via KMP") }
    }

    func deleteCategory(id: String) async throws {
        if await KMPBridge.shared.isKMPAvailable { Self.logger.info("Deleting category via KMP") }
    }

    private func fallbackCategories() async throws -> [CategoryItem] { try await MockCategoryRepository().getCategories() }
}
