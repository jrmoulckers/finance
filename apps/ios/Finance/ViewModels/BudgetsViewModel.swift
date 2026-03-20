// SPDX-License-Identifier: BUSL-1.1

// BudgetsViewModel.swift
// Finance
//
// ViewModel for the budgets screen. Loads budget categories from a
// repository, supports month navigation, and computes aggregate totals.

import Observation
import Foundation

@Observable
@MainActor
final class BudgetsViewModel {
    let repository: BudgetRepository

    var budgets: [BudgetItem] = []
    var isLoading = false
    var selectedMonth = Date()
    var showingCreateBudget = false
    var editingBudget: BudgetItem?

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
            // Error handling will be enhanced with KMP-backed repository
            budgets = []
        }
    }
}
