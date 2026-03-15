// SPDX-License-Identifier: BUSL-1.1

// TransactionsViewModel.swift
// Finance
//
// ViewModel for the full transaction list screen. Loads all transactions,
// supports search filtering, date grouping, and swipe-to-delete.

import Observation
import SwiftUI

@Observable
@MainActor
final class TransactionsViewModel {
    private let repository: TransactionRepository

    var transactions: [TransactionItem] = []
    var isLoading = false
    var searchText = ""
    var showingCreateTransaction = false

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
            // Error handling will be enhanced with KMP-backed repository
            transactions = []
        }
    }

    func deleteTransaction(id: String) async {
        do {
            try await repository.deleteTransaction(id: id)
        } catch {
            // Deletion error handling will be enhanced with KMP-backed repository
        }
        // Remove from local state for immediate UI feedback
        transactions.removeAll { $0.id == id }
    }
}
