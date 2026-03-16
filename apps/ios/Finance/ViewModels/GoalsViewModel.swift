// SPDX-License-Identifier: BUSL-1.1

// GoalsViewModel.swift
// Finance
//
// ViewModel for the goals screen. Loads financial goals from a
// repository and exposes them for card-based display.

import Observation
import Foundation

@Observable
@MainActor
final class GoalsViewModel {
    private let repository: GoalRepository

    var goals: [GoalItem] = []
    var isLoading = false
    var showingCreateGoal = false
    var errorMessage: String?

    init(repository: GoalRepository) {
        self.repository = repository
    }

    func loadGoals() async {
        isLoading = true
        defer { isLoading = false }

        do {
            goals = try await repository.getGoals()
        } catch {
            errorMessage = error.localizedDescription
            goals = []
        }
    }
}
