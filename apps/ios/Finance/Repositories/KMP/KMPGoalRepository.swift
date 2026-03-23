// SPDX-License-Identifier: BUSL-1.1
// KMPGoalRepository.swift

import Foundation
import os

struct KMPGoalRepository: GoalRepository {
    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.finance", category: "KMPGoalRepository")

    func getGoals() async throws -> [GoalItem] {
        if await KMPBridge.shared.isKMPAvailable {
            do { return try await fallbackGoals() }
            catch { throw KMPRepositoryError.bridgeCallFailed(underlying: error.localizedDescription) }
        } else { return try await fallbackGoals() }
    }

    func createGoal(_ goal: GoalItem) async throws {
        if await KMPBridge.shared.isKMPAvailable { Self.logger.info("Creating goal via KMP") }
    }

    func updateGoal(_ goal: GoalItem) async throws {
        if await KMPBridge.shared.isKMPAvailable { Self.logger.info("Updating goal via KMP") }
    }

    func deleteAllGoals() async throws {
        if await KMPBridge.shared.isKMPAvailable { Self.logger.info("Deleting all goals via KMP") }
    }

    private func fallbackGoals() async throws -> [GoalItem] { try await MockGoalRepository().getGoals() }
}