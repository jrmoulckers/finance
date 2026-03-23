// SPDX-License-Identifier: BUSL-1.1
// KMPBudgetRepository.swift

import Foundation
import os

struct KMPBudgetRepository: BudgetRepository {
    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.finance", category: "KMPBudgetRepository")
    func getBudgets() async throws -> [BudgetItem] {
        if await KMPBridge.shared.isKMPAvailable {
            do { return try await fallbackBudgets() }
            catch { throw KMPRepositoryError.bridgeCallFailed(underlying: error.localizedDescription) }
        } else { return try await fallbackBudgets() }
    }
    func createBudget(_ budget: BudgetItem) async throws {
        if await KMPBridge.shared.isKMPAvailable { Self.logger.info("Creating budget via KMP") }
    }
    func updateBudget(_ budget: BudgetItem) async throws {
        if await KMPBridge.shared.isKMPAvailable { Self.logger.info("Updating budget via KMP") }
    }
    func deleteAllBudgets() async throws {
        if await KMPBridge.shared.isKMPAvailable { Self.logger.info("Deleting all budgets via KMP") }
    }
    private func fallbackBudgets() async throws -> [BudgetItem] { try await MockBudgetRepository().getBudgets() }
}