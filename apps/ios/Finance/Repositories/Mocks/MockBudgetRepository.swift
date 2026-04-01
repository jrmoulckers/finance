// SPDX-License-Identifier: BUSL-1.1

// MockBudgetRepository.swift
// Finance
//
// In-memory mock implementation of BudgetRepository.
// TODO: Replace MockBudgetRepository with KMP-backed repository
// that reads from SQLDelight via the Swift Export bridge.

import Foundation

/// Returns hardcoded sample budgets for development and SwiftUI previews.
struct MockBudgetRepository: BudgetRepository {

    func getBudgets() async throws -> [BudgetItem] {
        [
            BudgetItem(
                id: "b1", name: String(localized: "Groceries"),
                categoryName: String(localized: "Groceries"),
                spentMinorUnits: 320_00, limitMinorUnits: 500_00,
                currencyCode: "USD", period: String(localized: "Monthly"), icon: "cart"
            ),
            BudgetItem(
                id: "b2", name: String(localized: "Dining Out"),
                categoryName: String(localized: "Dining Out"),
                spentMinorUnits: 180_00, limitMinorUnits: 200_00,
                currencyCode: "USD", period: String(localized: "Monthly"), icon: "fork.knife"
            ),
            BudgetItem(
                id: "b3", name: String(localized: "Transport"),
                categoryName: String(localized: "Transport"),
                spentMinorUnits: 95_00, limitMinorUnits: 150_00,
                currencyCode: "USD", period: String(localized: "Monthly"), icon: "car"
            ),
            BudgetItem(
                id: "b4", name: String(localized: "Entertainment"),
                categoryName: String(localized: "Entertainment"),
                spentMinorUnits: 210_00, limitMinorUnits: 200_00,
                currencyCode: "USD", period: String(localized: "Monthly"), icon: "film"
            ),
            BudgetItem(
                id: "b5", name: String(localized: "Shopping"),
                categoryName: String(localized: "Shopping"),
                spentMinorUnits: 75_00, limitMinorUnits: 300_00,
                currencyCode: "USD", period: String(localized: "Monthly"), icon: "bag"
            ),
        ]
    }

    func createBudget(_ budget: BudgetItem) async throws {
        // No-op for mock — simulates a successful save.
        try? await Task.sleep(for: .milliseconds(300))
    }

    func updateBudget(_ budget: BudgetItem) async throws { try? await Task.sleep(for: .milliseconds(300)) }
    func deleteAllBudgets() async throws { }
}
