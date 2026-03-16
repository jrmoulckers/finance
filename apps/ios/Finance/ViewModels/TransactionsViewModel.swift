// SPDX-License-Identifier: BUSL-1.1

// TransactionsViewModel.swift
// Finance
//
// ViewModel for the full transaction list screen. Loads all transactions,
// supports search filtering, advanced filters, date grouping, and swipe-to-delete.

import Observation
import os
import SwiftUI

@Observable
@MainActor
final class TransactionsViewModel {
    private let repository: TransactionRepository
    private let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "TransactionsViewModel"
    )

    var transactions: [TransactionItem] = []
    var isLoading = false
    var errorMessage: String?
    var searchText = ""
    var showingCreateTransaction = false

    /// Advanced filter state, presented via `TransactionFilterView`.
    var filters = TransactionFilters()
    /// Controls presentation of the filter sheet.
    var showFilterSheet = false

    /// Transactions grouped by calendar day, most recent first.
    struct DateGroup: Identifiable {
        let id: String
        let date: Date
        let transactions: [TransactionItem]
    }

    /// Transactions after applying both search text and advanced filters.
    var filteredTransactions: [TransactionItem] {
        var result = transactions

        // Apply search text
        if !searchText.isEmpty {
            result = result.filter {
                $0.payee.localizedCaseInsensitiveContains(searchText) ||
                $0.category.localizedCaseInsensitiveContains(searchText) ||
                $0.accountName.localizedCaseInsensitiveContains(searchText)
            }
        }

        // Apply advanced filters
        if filters.isActive {
            result = filters.apply(to: result)
        }

        return result
    }

    var groupedTransactions: [DateGroup] {
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: filteredTransactions) { calendar.startOfDay(for: $0.date) }
        return grouped.sorted { $0.key > $1.key }
            .map { DateGroup(id: $0.key.ISO8601Format(), date: $0.key, transactions: $0.value) }
    }

    /// Unique, sorted list of categories from all loaded transactions.
    var availableCategories: [String] {
        Array(Set(transactions.map(\.category))).sorted()
    }

    /// Number of currently active filter dimensions (for toolbar badge).
    var activeFilterCount: Int {
        filters.activeCount
    }

    init(repository: TransactionRepository) {
        self.repository = repository
    }

    func loadTransactions() async {
        isLoading = true
        defer { isLoading = false }

        do {
            transactions = try await repository.getTransactions()
            errorMessage = nil
            logger.debug("Loaded \(self.transactions.count, privacy: .public) transactions")
        } catch {
            logger.error("Failed to load transactions: \(error.localizedDescription, privacy: .public)")
            errorMessage = error.localizedDescription
        }
    }

    func deleteTransaction(id: String) async {
        do {
            try await repository.deleteTransaction(id: id)
            logger.info("Deleted transaction \(id, privacy: .private)")
        } catch {
            logger.error("Failed to delete transaction: \(error.localizedDescription, privacy: .public)")
            // Deletion error handling will be enhanced with KMP-backed repository
        }
        // Remove from local state for immediate UI feedback
        transactions.removeAll { $0.id == id }
    }

    /// Remove a single filter chip and log the action.
    func removeFilterChip(_ chip: FilterChip) {
        logger.debug("Removed filter chip: \(chip.id, privacy: .public)")
        filters.removeChip(chip)
    }

    /// Reset all filters to defaults.
    func clearAllFilters() {
        logger.debug("Cleared all filters")
        filters = .default
    }
}
