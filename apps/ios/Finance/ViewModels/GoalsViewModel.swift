// SPDX-License-Identifier: BUSL-1.1

// GoalsViewModel.swift
// Finance
//
// ViewModel for the goals screen. Loads financial goals from a
// repository and exposes them for card-based display.

import Foundation
import Observation
import os

@Observable
@MainActor
final class GoalsViewModel {
    private let repository: GoalRepository
    private let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "GoalsViewModel"
    )

    var goals: [GoalItem] = []
    var isLoading = false
    var errorMessage: String?
    var showingCreateGoal = false

    init(repository: GoalRepository) {
        self.repository = repository
    }

    func loadGoals() async {
        isLoading = true
        defer { isLoading = false }

        do {
            goals = try await repository.getGoals()
            errorMessage = nil
        } catch {
            logger.error("Failed to load goals: \(error.localizedDescription, privacy: .public)")
            errorMessage = error.localizedDescription
        }
    }
}
