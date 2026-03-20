// SPDX-License-Identifier: BUSL-1.1

// TransactionsViewModel.swift
// Finance
//
// ViewModel for the full transaction list screen. Loads all transactions,
// supports search filtering, date grouping, and swipe-to-delete.

import Observation
import os
import SwiftUI

@Observable
@MainActor
final class TransactionsViewModel {
    private let repository: TransactionRepository

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "TransactionsViewModel"
    )

    var transactions: [TransactionItem] = []
    var isLoading = false
    var searchText = ""
    var showingCreateTransaction = false
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

    var filteredTransactions: [TransactionItem] {
        guard !searchText.isEmpty else { return transactions }
        return transactions.filter {
            $0.payee.localizedCaseInsensitiveContains(searchText) ||
            $0.category.localizedCaseInsensitiveContains(searchText) ||
            $0.accountName.localizedCaseInsensitiveContains(searchText)
        }
    }

    var groupedTransactions: [DateGroup] {
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: filteredTransactions) { calendar.startOfDay(for: $0.date) }
        return grouped.sorted { $0.key > $1.key }
            .map { DateGroup(id: $0.key.ISO8601Format(), date: $0.key, transactions: $0.value) }
    }

    init(repository: TransactionRepository) {
        self.repository = repository
    }

    func loadTransactions() async {
        isLoading = true
        defer { isLoading = false }

        do {
            transactions = try await repository.getTransactions()
        } catch {
            errorMessage = String(localized: "Failed to load transactions. Please try again.")
            Self.logger.error("Transactions load failed: \(error.localizedDescription, privacy: .public)")
            transactions = []
        }
    }

    func deleteTransaction(id: String) async {
        do {
            try await repository.deleteTransaction(id: id)
        } catch {
            errorMessage = String(localized: "Failed to delete transaction. Please try again.")
            Self.logger.error("Transaction deletion failed: \(error.localizedDescription, privacy: .public)")
        }
        // Remove from local state for immediate UI feedback
        transactions.removeAll { $0.id == id }
    }
}
