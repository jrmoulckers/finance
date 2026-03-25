// SPDX-License-Identifier: BUSL-1.1

// GoalRepository.swift
// Finance
//
// Protocol defining the data-access contract for financial goals.
// Swap the concrete implementation to move from mock data to a
// KMP-backed repository without changing any ViewModel or View code.

import Foundation

/// Data-access contract for financial goals.
///
/// All methods are `async throws` so implementations can perform
/// network, database, or KMP bridge calls transparently.
protocol GoalRepository: Sendable {

    /// Returns all goals regardless of status.
    func getGoals() async throws -> [GoalItem]

    /// Persists a new goal.
    func createGoal(_ goal: GoalItem) async throws

    /// Updates an existing goal.
    func updateGoal(_ goal: GoalItem) async throws

    /// Permanently deletes every goal. Used for GDPR "Delete Everything".
    func deleteAllGoals() async throws
}
