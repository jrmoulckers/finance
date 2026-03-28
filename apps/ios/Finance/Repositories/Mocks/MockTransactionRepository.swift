// SPDX-License-Identifier: BUSL-1.1

// MockTransactionRepository.swift
// Finance
//
// In-memory mock implementation of TransactionRepository.
// TODO: Replace MockTransactionRepository with KMP-backed repository
// that reads from SQLDelight via the Swift Export bridge.

import Foundation

/// Returns hardcoded sample transactions for development and SwiftUI previews.
struct MockTransactionRepository: TransactionRepository {

    func getTransactions() async throws -> [TransactionItem] {
        [
            TransactionItem(
                id: "t1", payee: "Whole Foods",
                category: String(localized: "Groceries"),
                accountName: "Main Checking",
                amountMinorUnits: -85_40, currencyCode: "USD",
                date: .now, type: .expense, status: .cleared
            ),
            TransactionItem(
                id: "t2", payee: "Payroll",
                category: String(localized: "Income"),
                accountName: "Main Checking",
                amountMinorUnits: 4_250_00, currencyCode: "USD",
                date: .now, type: .income, status: .cleared
            ),
            TransactionItem(
                id: "t3", payee: "Netflix",
                category: String(localized: "Entertainment"),
                accountName: "Travel Card",
                amountMinorUnits: -15_99, currencyCode: "USD",
                date: Calendar.current.date(byAdding: .day, value: -1, to: .now)!,
                type: .expense, status: .cleared
            ),
            TransactionItem(
                id: "t4", payee: "Transfer to Savings",
                category: String(localized: "Transfer"),
                accountName: "Main Checking",
                amountMinorUnits: -500_00, currencyCode: "USD",
                date: Calendar.current.date(byAdding: .day, value: -1, to: .now)!,
                type: .transfer, status: .cleared
            ),
            TransactionItem(
                id: "t5", payee: "Shell Gas",
                category: String(localized: "Transport"),
                accountName: "Travel Card",
                amountMinorUnits: -45_00, currencyCode: "USD",
                date: Calendar.current.date(byAdding: .day, value: -2, to: .now)!,
                type: .expense, status: .pending
            ),
            TransactionItem(
                id: "t6", payee: "Starbucks",
                category: String(localized: "Dining Out"),
                accountName: "Main Checking",
                amountMinorUnits: -6_75, currencyCode: "USD",
                date: Calendar.current.date(byAdding: .day, value: -3, to: .now)!,
                type: .expense, status: .cleared
            ),
            TransactionItem(
                id: "t7", payee: "Amazon",
                category: String(localized: "Shopping"),
                accountName: "Travel Card",
                amountMinorUnits: -129_99, currencyCode: "USD",
                date: Calendar.current.date(byAdding: .day, value: -4, to: .now)!,
                type: .expense, status: .reconciled
            ),
        ]
    }


    func getTransactions(offset: Int, limit: Int) async throws -> [TransactionItem] {
        let all = try await getTransactions()
        let sorted = all.sorted { $0.date > $1.date }
        let start = min(offset, sorted.count)
        let end = min(start + limit, sorted.count)
        return Array(sorted[start..<end])
    }

    func getTransactions(forAccountId accountId: String) async throws -> [TransactionItem] {
        try await getTransactions().filter { $0.accountName.isEmpty || !accountId.isEmpty }
    }

    func getRecentTransactions(limit: Int) async throws -> [TransactionItem] {
        let all = try await getTransactions()
        return Array(all.sorted { $0.date > $1.date }.prefix(limit))
    }

    func createTransaction(_ transaction: TransactionItem) async throws {
        // No-op for mock — simulates a successful save.
        try? await Task.sleep(for: .milliseconds(300))
    }

    func updateTransaction(_ transaction: TransactionItem) async throws {
        // No-op for mock — simulates a successful update.
        try? await Task.sleep(for: .milliseconds(300))
    }

    func deleteTransaction(id: String) async throws {
        // No-op for mock — ViewModel manages local state removal.
    }

    func deleteAllTransactions() async throws {
        // No-op for mock — mock data is stateless and returns hardcoded values.
    }
}
