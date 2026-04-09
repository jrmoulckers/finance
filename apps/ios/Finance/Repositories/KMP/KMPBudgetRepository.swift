// SPDX-License-Identifier: BUSL-1.1
// KMPBudgetRepository.swift — KMP-backed budget repository using LocalDataStore.

import Foundation
import os

/// Budget repository backed by the actor-isolated ``LocalDataStore``.
///
/// When the FinanceSync XCFramework is available (`canImport(FinanceSync)`),
/// this will delegate to the KMP data layer. Until then, the local store
/// is seeded from mock data and supports full CRUD operations in-memory.
struct KMPBudgetRepository: BudgetRepository {
    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "KMPBudgetRepository"
    )
    private let store: LocalDataStore

    init(store: LocalDataStore = .shared) {
        self.store = store
    }

    func getBudgets() async throws -> [BudgetItem] {
        await store.seedIfNeeded()
        return await store.getBudgets()
    }

    func createBudget(_ budget: BudgetItem) async throws {
        Self.logger.info("Creating budget via KMP bridge")
        await store.upsertBudget(budget)
    }

    func updateBudget(_ budget: BudgetItem) async throws {
        Self.logger.info("Updating budget via KMP bridge")
        await store.upsertBudget(budget)
    }

    func deleteAllBudgets() async throws {
        Self.logger.info("Deleting all budgets via KMP bridge")
        await store.deleteAllBudgets()
    }
}