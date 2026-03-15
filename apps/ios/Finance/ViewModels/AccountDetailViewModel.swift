// SPDX-License-Identifier: BUSL-1.1

// AccountDetailViewModel.swift
// Finance
//
// ViewModel for the account detail screen. Loads transactions for a
// specific account and groups them by date for sectioned display.

import Foundation
import Observation
import os

@Observable
@MainActor
final class AccountDetailViewModel {
    private let repository: TransactionRepository
    private let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "AccountDetailViewModel"
    )

    var transactions: [TransactionItem] = []
    var isLoading = false
    var errorMessage: String?

    /// Transactions grouped by calendar day, most recent first.
    struct DateGroup: Identifiable {
        let id: String
        let date: Date
        let transactions: [TransactionItem]
    }

    var groupedTransactions: [DateGroup] {
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: transactions) { calendar.startOfDay(for: $0.date) }
        return grouped
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
            errorMessage = nil
        } catch {
            logger.error("Failed to load transactions: \(error.localizedDescription, privacy: .public)")
            errorMessage = error.localizedDescription
        }
    }
}
