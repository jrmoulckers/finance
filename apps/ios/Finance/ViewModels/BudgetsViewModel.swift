// SPDX-License-Identifier: BUSL-1.1

// BudgetsViewModel.swift
// Finance
//
// ViewModel for the budgets screen. Loads budget categories from a
// repository, supports month navigation, and computes aggregate totals.

import Observation
import Foundation
import os

@Observable
@MainActor
final class BudgetsViewModel {
    let repository: BudgetRepository

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "BudgetsViewModel"
    )

    var budgets: [BudgetItem] = []
    var isLoading = false
    var selectedMonth = Date()
    var showingCreateBudget = false
    var editingBudget: BudgetItem?
    var errorMessage: String?

    /// Whether an error alert should be presented.
    var showError: Bool { errorMessage != nil }

    /// Clears the current error message, dismissing the alert.
    func dismissError() { errorMessage = nil }

    var totalBudgeted: Int64 { budgets.reduce(0) { $0 + $1.limitMinorUnits } }
    var totalSpent: Int64 { budgets.reduce(0) { $0 + $1.spentMinorUnits } }

    var monthDisplayText: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"
        return formatter.string(from: selectedMonth)
    }

    init(repository: BudgetRepository) {
        self.repository = repository
    }

    func previousMonth() {
        if let d = Calendar.current.date(byAdding: .month, value: -1, to: selectedMonth) {
            selectedMonth = d
            Task { await loadBudgets() }
        }
    }

    func nextMonth() {
        if let d = Calendar.current.date(byAdding: .month, value: 1, to: selectedMonth) {
            selectedMonth = d
            Task { await loadBudgets() }
        }
    }

    func loadBudgets() async {
        isLoading = true
        defer { isLoading = false }

        do {
            budgets = try await repository.getBudgets()
        } catch {
            errorMessage = String(localized: "Failed to load budgets. Please try again.")
            Self.logger.error("Budgets load failed: \(error.localizedDescription, privacy: .public)")
            budgets = []
        }
    }
}
