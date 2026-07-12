// SPDX-License-Identifier: BUSL-1.1

// BudgetsViewModel.swift
// Finance
//
// ViewModel for the budgets screen. Loads budget categories from a
// repository, supports month navigation, and computes aggregate totals.
// Uses Swift Export bridge for currency formatting. Refs #289

import Observation
import Foundation
import os

@Observable
final class BudgetsViewModel {
    let repository: BudgetRepository
    private let formatter: any SwiftExportFormatterModule

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

    /// Active display currency used for the aggregate summary totals so the
    /// Settings preference drives this screen too (#2203).
    var displayCurrencyCode: String = CurrencyPreferences.displayCurrencyCode()

    /// Whether an error alert should be presented.
    var showError: Bool { errorMessage != nil }

    /// Clears the current error message, dismissing the alert.
    func dismissError() { errorMessage = nil }

    var totalBudgeted: Int64 { budgets.reduce(0) { $0 + $1.limitMinorUnits } }
    var totalSpent: Int64 { budgets.reduce(0) { $0 + $1.spentMinorUnits } }

    /// Cached date formatter for month display — avoids allocating
    /// a new `DateFormatter` on every SwiftUI body evaluation.
    private static let monthFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"
        return formatter
    }()

    var monthDisplayText: String {
        Self.monthFormatter.string(from: selectedMonth)
    }

    /// Formats a monetary amount using the Swift Export formatter module.
    func formatCurrency(_ amountMinorUnits: Int64, currencyCode: String = "USD", showSign: Bool = false) -> String {
        formatter.format(
            amountMinorUnits: amountMinorUnits,
            currencyCode: currencyCode,
            showSign: showSign
        )
    }

    init(
        repository: BudgetRepository,
        formatter: any SwiftExportFormatterModule = SwiftExportBridgeProvider.shared.formatter
    ) {
        self.repository = repository
        self.formatter = formatter
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

        displayCurrencyCode = CurrencyPreferences.displayCurrencyCode()

        do {
            budgets = try await repository.getBudgets()
        } catch {
            errorMessage = String(localized: "Failed to load budgets. Please try again.")
            Self.logger.error("Budgets load failed: \(error.localizedDescription, privacy: .public)")
            budgets = []
        }
    }
}
