// SPDX-License-Identifier: BUSL-1.1

// GoalsViewModel.swift
// Finance
//
// ViewModel for the goals screen. Loads financial goals from a
// repository and exposes them for card-based display.

import Observation
import Foundation
import os

@Observable
final class GoalsViewModel {
    let repository: GoalRepository

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "GoalsViewModel"
    )

    var goals: [GoalItem] = []
    var isLoading = false
    var showingCreateGoal = false
    var editingGoal: GoalItem?
    var errorMessage: String?

    /// Whether an error alert should be presented.
    var showError: Bool { errorMessage != nil }

    /// Clears the current error message, dismissing the alert.
    func dismissError() { errorMessage = nil }

    init(repository: GoalRepository) {
        self.repository = repository
    }

    func loadGoals() async {
        isLoading = true
        defer { isLoading = false }

        do {
            goals = try await repository.getGoals()
        } catch {
            errorMessage = String(localized: "Failed to load goals. Please try again.")
            Self.logger.error("Goals load failed: \(error.localizedDescription, privacy: .public)")
            goals = []
        }
    }
}
