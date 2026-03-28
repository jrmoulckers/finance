// SPDX-License-Identifier: BUSL-1.1

// MockGoalRepository.swift
// Finance
//
// In-memory mock implementation of GoalRepository.
// TODO: Replace MockGoalRepository with KMP-backed repository
// that reads from SQLDelight via the Swift Export bridge.

import Foundation
import SwiftUI

/// Returns hardcoded sample goals for development and SwiftUI previews.
struct MockGoalRepository: GoalRepository {

    func getGoals() async throws -> [GoalItem] {
        [
            GoalItem(
                id: "g1", name: String(localized: "Emergency Fund"),
                currentMinorUnits: 7_500_00, targetMinorUnits: 10_000_00,
                currencyCode: "USD",
                targetDate: Calendar.current.date(byAdding: .month, value: 6, to: .now),
                status: .active, icon: "shield", color: .blue
            ),
            GoalItem(
                id: "g2", name: String(localized: "Vacation"),
                currentMinorUnits: 1_200_00, targetMinorUnits: 5_000_00,
                currencyCode: "USD",
                targetDate: Calendar.current.date(byAdding: .month, value: 12, to: .now),
                status: .active, icon: "airplane", color: .teal
            ),
            GoalItem(
                id: "g3", name: String(localized: "New Laptop"),
                currentMinorUnits: 2_000_00, targetMinorUnits: 2_000_00,
                currencyCode: "USD",
                targetDate: nil,
                status: .completed, icon: "laptopcomputer", color: .green
            ),
            GoalItem(
                id: "g4", name: String(localized: "Home Down Payment"),
                currentMinorUnits: 15_000_00, targetMinorUnits: 60_000_00,
                currencyCode: "USD",
                targetDate: Calendar.current.date(byAdding: .year, value: 3, to: .now),
                status: .active, icon: "house", color: .purple
            ),
        ]
    }

    func createGoal(_ goal: GoalItem) async throws {
        // No-op for mock — simulates a successful save.
        try? await Task.sleep(for: .milliseconds(300))
    }

    func updateGoal(_ goal: GoalItem) async throws {
        // No-op for mock — simulates a successful update.
        try? await Task.sleep(for: .milliseconds(300))
    }

    func deleteAllGoals() async throws {
        // No-op for mock — mock data is stateless and returns hardcoded values.
    }
}
