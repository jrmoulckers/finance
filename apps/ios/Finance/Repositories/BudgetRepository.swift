// SPDX-License-Identifier: BUSL-1.1

// BudgetRepository.swift
// Finance
//
// Protocol defining the data-access contract for budgets.
// Swap the concrete implementation to move from mock data to a
// KMP-backed repository without changing any ViewModel or View code.

import Foundation

/// Data-access contract for budget categories.
///
/// All methods are `async throws` so implementations can perform
/// network, database, or KMP bridge calls transparently.
protocol BudgetRepository: Sendable {

    /// Returns all budgets for the current or specified period.
    func getBudgets() async throws -> [BudgetItem]

    /// Persists a new budget.
    func createBudget(_ budget: BudgetItem) async throws

    /// Updates an existing budget.
    func updateBudget(_ budget: BudgetItem) async throws
}
