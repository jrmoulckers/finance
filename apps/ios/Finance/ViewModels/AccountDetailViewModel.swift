// SPDX-License-Identifier: BUSL-1.1

// AccountDetailViewModel.swift
// Finance
//
// ViewModel for the account detail screen. Loads transactions for a
// specific account and groups them by date for sectioned display.

import Observation
import Foundation
import os

@Observable
final class AccountDetailViewModel {
    private let repository: TransactionRepository

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "AccountDetailViewModel"
    )

    var transactions: [TransactionItem] = []
    var isLoading = false
    var errorMessage: String?

    /// Whether an error alert should be presented.
    var showError: Bool { errorMessage != nil }

    /// Clears the current error message, dismissing the alert.
    func dismissError() { errorMessage = nil }

    /// Transactions grouped by calendar day, most recent first.
    struct DateGroup: Identifiable {
        let id: String
        let date: Date
        let transactions: [TransactionItem]
    }

    // MARK: - Cached Grouped Transactions
    //
    // Previously a computed property that re-grouped and re-sorted
    // on every SwiftUI body evaluation — O(n log n) per render.
    // Now recomputed only when `transactions` changes.

    private(set) var groupedTransactions: [DateGroup] = []

    /// Recomputes `groupedTransactions` from the current `transactions`.
    private func recomputeGroupedTransactions() {
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: transactions) { calendar.startOfDay(for: $0.date) }
        groupedTransactions = grouped
            .sorted { $0.key > $1.key }
            .map { DateGroup(id: $0.key.ISO8601Format(), date: $0.key, transactions: $0.value) }
    }

    init(repository: TransactionRepository) {
        self.repository = repository
    }

    func loadTransactions(accountId: String) async {
        isLoading = true
        defer { isLoading = false }

        do {
            transactions = try await repository.getTransactions(forAccountId: accountId)
            recomputeGroupedTransactions()
        } catch {
            errorMessage = String(localized: "Failed to load transactions. Please try again.")
            Self.logger.error("Account detail load failed: \(error.localizedDescription, privacy: .public)")
            transactions = []
            recomputeGroupedTransactions()
        }
    }
}
