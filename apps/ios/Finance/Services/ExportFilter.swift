// SPDX-License-Identifier: BUSL-1.1

// ExportFilter.swift
// Finance
//
// Pure-function filtering logic for data export. Filters transactions
// by date range and account selection, and filters accounts by selected
// IDs. All functions are static and side-effect-free for testability.
// Refs #680

import Foundation

// MARK: - ExportFilter

/// Pure filtering utilities for scoping data exports by date range
/// and account selection.
///
/// All methods are static and deterministic — they take input data and
/// filter criteria, and return filtered results with no side effects.
/// This makes them straightforward to unit test without mocks.
enum ExportFilter {

    // MARK: - Transaction Filtering

    /// Filters transactions by date range and account selection.
    ///
    /// - Parameters:
    ///   - transactions: The full list of transactions to filter.
    ///   - accounts: All available accounts, used to resolve selected
    ///     account IDs to account names for matching.
    ///   - startDate: If non-nil, excludes transactions before this date.
    ///     Comparison uses start-of-day for the given date.
    ///   - endDate: If non-nil, excludes transactions after this date.
    ///     Comparison uses end-of-day for the given date.
    ///   - selectedAccountIDs: Account IDs to include. An empty set means
    ///     "all accounts" (no account filter applied).
    /// - Returns: Transactions matching all active filter criteria.
    static func filterTransactions(
        _ transactions: [TransactionItem],
        accounts: [AccountItem],
        startDate: Date?,
        endDate: Date?,
        selectedAccountIDs: Set<String>
    ) -> [TransactionItem] {
        let selectedNames: Set<String>
        if selectedAccountIDs.isEmpty {
            selectedNames = []
        } else {
            selectedNames = Set(
                accounts
                    .filter { selectedAccountIDs.contains($0.id) }
                    .map(\.name)
            )
        }

        let calendar = Calendar.current

        // Normalise date boundaries to include the full start/end days.
        let normalisedStart: Date? = startDate.flatMap {
            calendar.startOfDay(for: $0)
        }

        let normalisedEnd: Date? = endDate.flatMap { date in
            guard let nextDay = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: date)) else {
                return date
            }
            return nextDay
        }

        return transactions.filter { transaction in
            // Date range check
            if let start = normalisedStart, transaction.date < start {
                return false
            }
            if let end = normalisedEnd, transaction.date >= end {
                return false
            }

            // Account filter check
            if !selectedNames.isEmpty, !selectedNames.contains(transaction.accountName) {
                return false
            }

            return true
        }
    }

    // MARK: - Account Filtering

    /// Filters accounts to only those selected by the user.
    ///
    /// - Parameters:
    ///   - accounts: The full list of accounts.
    ///   - selectedIDs: Account IDs to include. An empty set means
    ///     "all accounts" (no filter applied).
    /// - Returns: Accounts whose IDs are in the selected set, or all
    ///   accounts if the set is empty.
    static func filterAccounts(
        _ accounts: [AccountItem],
        selectedIDs: Set<String>
    ) -> [AccountItem] {
        guard !selectedIDs.isEmpty else { return accounts }
        return accounts.filter { selectedIDs.contains($0.id) }
    }

    // MARK: - Summary

    /// Returns a human-readable summary of the active filters for
    /// accessibility announcements and confirmation display.
    ///
    /// - Parameters:
    ///   - dateFilterEnabled: Whether the date range filter is active.
    ///   - startDate: The start date if date filtering is enabled.
    ///   - endDate: The end date if date filtering is enabled.
    ///   - selectedAccountCount: Number of accounts selected (0 = all).
    ///   - totalAccountCount: Total number of available accounts.
    ///   - format: The selected export format.
    /// - Returns: A localized summary string.
    static func filterSummary(
        dateFilterEnabled: Bool,
        startDate: Date,
        endDate: Date,
        selectedAccountCount: Int,
        totalAccountCount: Int,
        format: ExportFormat
    ) -> String {
        var parts: [String] = []

        parts.append(String(localized: "Format: \(format.displayName)"))

        if dateFilterEnabled {
            let formatter = DateFormatter()
            formatter.dateStyle = .medium
            formatter.timeStyle = .none
            let start = formatter.string(from: startDate)
            let end = formatter.string(from: endDate)
            parts.append(String(localized: "Date range: \(start) to \(end)"))
        } else {
            parts.append(String(localized: "Date range: All time"))
        }

        if selectedAccountCount > 0, selectedAccountCount < totalAccountCount {
            parts.append(String(localized: "Accounts: \(selectedAccountCount) of \(totalAccountCount) selected"))
        } else {
            parts.append(String(localized: "Accounts: All"))
        }

        return parts.joined(separator: ". ")
    }
}
